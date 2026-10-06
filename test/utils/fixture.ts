import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { cp, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
export const fixtureDirectory = (name: string) => resolve(repositoryRoot, 'test/fixtures', name)

export const unusedPlugins = [
    'audit',
    'cache',
    'compression',
    'encryption',
    'failover',
    'tiering',
    'tracing',
    'usage',
    'zip',
]

export const runCommand = (
    command: string,
    args: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv; shell?: boolean; timeout?: number; signal?: AbortSignal } = {},
): Promise<string> =>
    new Promise((resolveOutput, reject) => {
        if (options.signal?.aborted) {
            reject(new Error('Command cancelled before startup'))
            return
        }
        const cwd = options.cwd ?? repositoryRoot
        const child = spawn(command, args, {
            cwd,
            env: { ...process.env, ...options.env },
            shell: options.shell,
            detached: process.platform !== 'win32',
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        let output = ''
        let cancellation: Promise<void> | undefined
        let cancellationReason: string | undefined
        const cancel = (reason: string) => {
            if (cancellation) return
            cancellationReason = reason
            // Enumeration happens before signalling, so npm's script descendants remain scoped.
            cancellation = closeOwnedProcess(child, { cwd })
                .catch((error: unknown) => {
                    cancellationReason += `\nCommand cleanup: ${String(error)}`
                })
                .then(() => {
                    reject(new Error(`${command} ${args.join(' ')} cancelled: ${cancellationReason}\n${output}`))
                })
        }
        const abort = () => cancel('Command cancelled by session deadline')
        const timeout = setTimeout(
            () => cancel(`Command exceeded ${options.timeout ?? 290_000}ms`),
            options.timeout ?? 290_000,
        )
        timeout.unref()
        options.signal?.addEventListener('abort', abort, { once: true })
        child.stdout.on('data', (chunk) => (output += chunk))
        child.stderr.on('data', (chunk) => (output += chunk))
        child.once('error', (error) => {
            clearTimeout(timeout)
            options.signal?.removeEventListener('abort', abort)
            reject(error)
        })
        child.once('close', (code) => {
            clearTimeout(timeout)
            options.signal?.removeEventListener('abort', abort)
            void (async () => {
                if (cancellation) await cancellation
                if (cancellationReason || code !== 0)
                    reject(
                        new Error(
                            `${command} ${args.join(' ')} failed (${code})${cancellationReason ? `: ${cancellationReason}` : ''}\n${output}`,
                        ),
                    )
                else resolveOutput(output)
            })()
        })
    })

let packageBuild: Promise<string> | undefined

export const buildPackage = async (): Promise<string> => {
    if (process.env.VITEST && (await import('vitest')).inject('filesPackageBuilt')) return ''
    return (packageBuild ??= runCommand('bun', ['run', 'build']))
}

export const installFixture = async (name: string): Promise<string> => {
    await buildPackage()
    return runCommand(
        'bun',
        ['install', '--ignore-scripts', ...(name === 'nuxt5-nightly' ? [] : ['--frozen-lockfile'])],
        { cwd: fixtureDirectory(name) },
    )
}

export const cleanFixture = async (name: string): Promise<void> => {
    const directory = fixtureDirectory(name)
    await Promise.all(
        ['.nuxt', '.nitro', 'node_modules/.nitro', 'node_modules/.cache/nuxt/.nuxt', '.output', '.data'].map((entry) =>
            rm(resolve(directory, entry), { recursive: true, force: true }),
        ),
    )
}

export const runFixture = async (
    name: string,
    scripts: string[] = ['prepare', 'typecheck', 'build'],
): Promise<void> => {
    const directory = fixtureDirectory(name)
    await cleanFixture(name)
    await installFixture(name)
    for (const script of scripts) {
        await runCommand('bun', ['run', script], { cwd: directory })
    }
}

export const readOutput = async (directory: string, runtimeOnly = false): Promise<string> => {
    const contents: string[] = []
    const visited = new Set<string>()
    const visit = async (path: string): Promise<void> => {
        const canonical = await realpath(path)
        if (visited.has(canonical)) return
        visited.add(canonical)
        for (const entry of await readdir(path, { withFileTypes: true })) {
            const child = resolve(path, entry.name)
            // Windows package managers emit directory junctions in deployment outputs.
            const metadata = entry.isSymbolicLink() ? await stat(child) : entry
            if (metadata.isDirectory()) await visit(child)
            else if (metadata.isFile() && (!runtimeOnly || /\.(?:js|mjs|cjs|html|css)$/u.test(child)))
                contents.push(await readFile(child, 'utf8'))
        }
    }
    await visit(directory)
    return contents.join('\n')
}

export const directorySize = async (directory: string): Promise<number> => {
    let bytes = 0
    const visit = async (path: string): Promise<void> => {
        for (const entry of await readdir(path, { withFileTypes: true })) {
            const child = resolve(path, entry.name)
            if (entry.isDirectory()) await visit(child)
            else bytes += (await stat(child)).size
        }
    }
    await visit(directory)
    return bytes
}

export const outputPaths = async (directory: string): Promise<string[]> =>
    (await readdir(directory, { recursive: true })).map((path) => path.replaceAll('\\', '/'))

/** Nuxt 4.6 may put generated framework files in its native node_modules cache. */
export const nuxtBuildDirectory = async (directory: string): Promise<string> => {
    for (const child of ['.nuxt', 'node_modules/.cache/nuxt/.nuxt']) {
        const candidate = resolve(directory, child)
        try {
            if ((await stat(resolve(candidate, 'nuxt-files-sdk'))).isDirectory()) return candidate
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
    }
    throw new Error('No generated Nuxt Files SDK directory exists')
}

export const startFixtureServer = async (
    name: string,
    options: { development?: boolean; readyPath?: string } = {},
): Promise<{ url: string; close: () => Promise<void>; output: () => string }> => {
    const reservation = createServer()
    await new Promise<void>((ready, reject) => {
        reservation.once('error', reject)
        reservation.listen(0, '127.0.0.1', ready)
    })
    const address = reservation.address()
    if (!address || typeof address === 'string') throw new Error('No fixture port allocated')
    const port = address.port
    await new Promise<void>((closed) => reservation.close(() => closed()))
    const child = spawn(
        'node',
        options.development
            ? ['node_modules/nuxt/bin/nuxt.mjs', 'dev', '--no-fork', '--port', String(port), '--host', '127.0.0.1']
            : ['.output/server/index.mjs'],
        {
            cwd: fixtureDirectory(name),
            env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NITRO_NO_UNIX_SOCKET: '1' },
            detached: process.platform !== 'win32',
            stdio: ['ignore', 'pipe', 'pipe'],
        },
    )
    let output = ''
    let spawnError: Error | undefined
    child.on('error', (error) => (spawnError = error))
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    const url = `http://127.0.0.1:${port}`
    try {
        for (let attempt = 0; attempt < (options.development ? 300 : 100); attempt += 1) {
            if (spawnError) throw spawnError
            if (child.exitCode !== null || child.signalCode !== null)
                throw new Error(`Fixture server exited early.\n${output}`)
            if (
                await fetch(`${url}${options.readyPath ?? ''}`, { signal: AbortSignal.timeout(500) })
                    .then((response) => (options.readyPath ? response.ok : true))
                    .catch(() => false)
            ) {
                return { url, close: () => closeProcess(child), output: () => output }
            }
            await new Promise((resolveWait) => setTimeout(resolveWait, 100))
        }
        throw new Error(`Fixture server did not start.\n${output}`)
    } catch (error) {
        await closeProcess(child)
        throw error
    }
}

// Bounded system utilities must not recursively enumerate themselves on timeout.
const processUtility = (command: string, args: string[], cwd: string, timeout = 10_000): Promise<string> =>
    new Promise((done, fail) => {
        execFile(command, args, { cwd, timeout, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) fail(new Error(`${command} process utility failed: ${error.message}\n${stderr}`))
            else done(stdout)
        })
    })

const ownedPidAlive = (pid: number): boolean => {
    try {
        process.kill(pid, 0)
        return true
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
        throw error
    }
}

/** Terminate only this handle and its captured owned tree/group, within bounded waits. */
export const closeOwnedProcess = async (
    child: ChildProcess,
    options: { cwd?: string; reported?: ReadonlySet<number>; ipcMessage?: string } = {},
): Promise<void> => {
    const cwd = options.cwd ?? repositoryRoot
    const owned = new Set(options.reported)
    const captured = new Set<number>()
    const depth = new Map<number, number>()
    const errors: string[] = []
    const closed = () => child.exitCode !== null || child.signalCode !== null
    if (child.pid) {
        owned.add(child.pid)
        captured.add(child.pid)
        depth.set(child.pid, 0)
    }
    try {
        if (process.platform === 'win32') {
            const raw = JSON.parse(
                await processUtility(
                    'powershell.exe',
                    [
                        '-NoProfile',
                        '-NonInteractive',
                        '-Command',
                        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress',
                    ],
                    cwd,
                ),
            ) as { ProcessId: number; ParentProcessId: number } | { ProcessId: number; ParentProcessId: number }[]
            const rows = Array.isArray(raw) ? raw : [raw]
            let changed = true
            while (changed) {
                changed = false
                for (const row of rows)
                    if (captured.has(row.ParentProcessId) && !captured.has(row.ProcessId)) {
                        captured.add(row.ProcessId)
                        owned.add(row.ProcessId)
                        depth.set(row.ProcessId, (depth.get(row.ParentProcessId) ?? 0) + 1)
                        changed = true
                    }
            }
        } else {
            const raw = await processUtility('ps', ['-eo', 'pid=,pgid='], cwd)
            for (const row of raw.trim().split('\n')) {
                const [pid, group] = row.trim().split(/\s+/u).map(Number)
                if (pid && group === child.pid) {
                    captured.add(pid)
                    owned.add(pid)
                }
            }
        }
    } catch (error) {
        errors.push(`Owned-process enumeration failed: ${String(error)}`)
    }
    if (!closed()) {
        if (options.ipcMessage && child.connected) {
            await new Promise<void>((done) => {
                const timeout = setTimeout(() => {
                    errors.push('Native shutdown IPC send timed out')
                    done()
                }, 2000)
                try {
                    child.send(options.ipcMessage!, (error) => {
                        clearTimeout(timeout)
                        if (error) errors.push(`Native shutdown IPC failed: ${error.message}`)
                        done()
                    })
                } catch (error) {
                    clearTimeout(timeout)
                    errors.push(String(error))
                    done()
                }
            })
        } else if (options.ipcMessage && process.platform === 'win32') {
            errors.push('Windows native shutdown IPC channel is unavailable')
        } else child.kill('SIGTERM')
    }
    const deadline = Date.now() + 20_000
    while ((!closed() || [...owned].some(ownedPidAlive)) && Date.now() < deadline)
        await new Promise((done) => setTimeout(done, 100))
    if (!closed() || [...owned].some(ownedPidAlive)) {
        errors.push('Native process shutdown exceeded its cleanup deadline')
        if (process.platform === 'win32') {
            // The supervisor can exit before a descendant: use the pre-shutdown snapshot.
            const survivors = [...captured]
                .filter(ownedPidAlive)
                .toSorted((a, b) => (depth.get(b) ?? 0) - (depth.get(a) ?? 0))
            const fallbackDeadline = Date.now() + 10_000
            for (const pid of survivors) {
                const remaining = fallbackDeadline - Date.now()
                if (remaining <= 0) {
                    errors.push('Scoped Windows fallback exceeded its total budget')
                    break
                }
                if (!ownedPidAlive(pid)) continue
                try {
                    await processUtility('taskkill', ['/PID', String(pid), '/T', '/F'], cwd, remaining)
                } catch (error) {
                    if (ownedPidAlive(pid)) errors.push(`Scoped Windows fallback failed for ${pid}: ${String(error)}`)
                }
            }
        } else if (child.pid) {
            try {
                process.kill(-child.pid, 'SIGKILL')
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ESRCH') errors.push(String(error))
            }
        }
    }
    const forcedDeadline = Date.now() + 10_000
    while ((!closed() || [...owned].some(ownedPidAlive)) && Date.now() < forcedDeadline)
        await new Promise((done) => setTimeout(done, 100))
    if (!closed() || [...owned].some(ownedPidAlive)) errors.push('Captured owned processes survived bounded cleanup')
    if (errors.length) throw new Error(errors.join('\n'))
}

const closeProcess = (child: ChildProcess): Promise<void> => closeOwnedProcess(child)

export const packPackage = async (): Promise<{ directory: string; tarball: string }> => {
    const directory = join(tmpdir(), `nuxt-files-sdk-${crypto.randomUUID()}`)
    await mkdir(directory, { recursive: true })
    if (process.env.NUXT_FILES_TARBALL) {
        return { directory, tarball: resolve(process.env.NUXT_FILES_TARBALL) }
    }
    await runCommand('bun', ['pm', 'pack', '--destination', directory], {
        cwd: resolve(repositoryRoot, 'packages/nuxt-files-sdk'),
    })
    const tarball = (await readdir(directory)).find((entry) => entry.endsWith('.tgz'))
    if (!tarball) throw new Error('bun pm pack did not create a tarball')
    return { directory, tarball: resolve(directory, tarball) }
}

export const copyPackedConsumer = async (fixture: string, directory: string, tarball: string): Promise<string> => {
    const destination = resolve(directory, fixture)
    const ignored = new Set([
        'node_modules',
        '.nuxt',
        '.nitro',
        '.output',
        '.data',
        '.contract-invalid',
        '.contract-examples',
        '.contract-docs',
        'bun.lock',
    ])
    await cp(fixtureDirectory(fixture), destination, {
        recursive: true,
        filter: (source) => !ignored.has(basename(source)),
    })
    const packagePath = resolve(destination, 'package.json')
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as {
        dependencies: Record<string, string>
    }
    packageJson.dependencies['nuxt-files-sdk'] = `file:${tarball.replaceAll('\\', '/')}`
    delete packageJson.dependencies['files-sdk']
    if (fixture === 'nuxt4' && process.env.NUXT_FILES_NUXT_VERSION) {
        packageJson.dependencies.nuxt = process.env.NUXT_FILES_NUXT_VERSION
    }
    if (fixture === 'nitro-v2' && process.env.NUXT_FILES_NITRO2_VERSION) {
        packageJson.dependencies.nitropack = process.env.NUXT_FILES_NITRO2_VERSION
    }
    await writeFile(packagePath, `${JSON.stringify(packageJson, null, 4)}\n`)
    return destination
}
