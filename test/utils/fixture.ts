import { spawn, type ChildProcess } from 'node:child_process'
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
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
    options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<string> =>
    new Promise((resolveOutput, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd ?? repositoryRoot,
            env: { ...process.env, ...options.env },
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 290_000,
        })
        let output = ''
        child.stdout.on('data', (chunk) => (output += chunk))
        child.stderr.on('data', (chunk) => (output += chunk))
        child.on('error', reject)
        child.on('close', (code) =>
            code === 0
                ? resolveOutput(output)
                : reject(new Error(`${command} ${args.join(' ')} failed (${code})\n${output}`)),
        )
    })

let packageBuild: Promise<string> | undefined

export const buildPackage = (): Promise<string> => (packageBuild ??= runCommand('bun', ['run', 'build']))

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
        ['.nuxt', '.nitro', '.output', '.data'].map((entry) =>
            rm(resolve(directory, entry), { recursive: true, force: true }),
        ),
    )
}

export const runFixture = async (name: string): Promise<void> => {
    const directory = fixtureDirectory(name)
    await cleanFixture(name)
    await installFixture(name)
    for (const script of ['prepare', 'typecheck', 'build']) {
        await runCommand('bun', ['run', script], { cwd: directory })
    }
}

export const readOutput = async (directory: string, runtimeOnly = false): Promise<string> => {
    const contents: string[] = []
    const visit = async (path: string): Promise<void> => {
        for (const entry of await readdir(path, { withFileTypes: true })) {
            const child = resolve(path, entry.name)
            if (entry.isDirectory()) await visit(child)
            else if (!runtimeOnly || /\.(?:js|mjs|cjs|html|css)$/u.test(child))
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

export const startFixtureServer = async (name: string): Promise<{ url: string; close: () => Promise<void> }> => {
    const reservation = createServer()
    await new Promise<void>((ready, reject) => {
        reservation.once('error', reject)
        reservation.listen(0, '127.0.0.1', ready)
    })
    const address = reservation.address()
    if (!address || typeof address === 'string') throw new Error('No fixture port allocated')
    const port = address.port
    await new Promise<void>((closed) => reservation.close(() => closed()))
    const child = spawn('node', ['.output/server/index.mjs'], {
        cwd: fixtureDirectory(name),
        env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
        stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    let spawnError: Error | undefined
    child.on('error', (error) => (spawnError = error))
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    const url = `http://127.0.0.1:${port}`
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (spawnError) throw spawnError
        if (child.exitCode !== null) throw new Error(`Fixture server exited early.\n${output}`)
        if (
            await fetch(url, { signal: AbortSignal.timeout(500) })
                .then(() => true)
                .catch(() => false)
        ) {
            return { url, close: () => closeProcess(child) }
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 100))
    }
    await closeProcess(child)
    throw new Error(`Fixture server did not start.\n${output}`)
}

const closeProcess = (child: ChildProcess): Promise<void> => {
    if (child.exitCode !== null) return Promise.resolve()
    child.kill()
    return new Promise((resolveClose) => child.once('exit', () => resolveClose()))
}

export const packPackage = async (): Promise<{ directory: string; tarball: string }> => {
    const directory = join(tmpdir(), `nuxt-files-sdk-${crypto.randomUUID()}`)
    await mkdir(directory, { recursive: true })
    if (process.env.NUXT_FILES_TARBALL) {
        return { directory, tarball: resolve(process.env.NUXT_FILES_TARBALL) }
    }
    await buildPackage()
    await runCommand('bun', ['pm', 'pack', '--destination', directory], {
        cwd: resolve(repositoryRoot, 'packages/nuxt-files-sdk'),
    })
    const tarball = (await readdir(directory)).find((entry) => entry.endsWith('.tgz'))
    if (!tarball) throw new Error('bun pm pack did not create a tarball')
    return { directory, tarball: resolve(directory, tarball) }
}

export const copyPackedConsumer = async (fixture: string, directory: string, tarball: string): Promise<string> => {
    const destination = resolve(directory, fixture)
    const ignored = new Set(['node_modules', '.nuxt', '.nitro', '.output', '.data', '.contract-invalid', 'bun.lock'])
    await cp(fixtureDirectory(fixture), destination, {
        recursive: true,
        filter: (source) => !ignored.has(basename(source)),
    })
    const packagePath = resolve(destination, 'package.json')
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as {
        dependencies: Record<string, string>
        overrides?: Record<string, string>
    }
    packageJson.dependencies['nuxt-files-sdk'] = `file:${tarball.replaceAll('\\', '/')}`
    if (process.env.NUXT_FILES_SDK_VERSION) {
        packageJson.overrides = { 'files-sdk': process.env.NUXT_FILES_SDK_VERSION }
    }
    if (fixture === 'nuxt4' && process.env.NUXT_FILES_NUXT_VERSION) {
        packageJson.dependencies.nuxt = process.env.NUXT_FILES_NUXT_VERSION
    }
    if (fixture === 'nitro-v2' && process.env.NUXT_FILES_NITRO2_VERSION) {
        packageJson.dependencies.nitropack = process.env.NUXT_FILES_NITRO2_VERSION
    }
    await writeFile(packagePath, `${JSON.stringify(packageJson, null, 4)}\n`)
    return destination
}
