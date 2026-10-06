import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'

interface SessionOptions {
    consumer: string
    install: (directory: string) => Promise<string>
    runScript: (directory: string, script: string) => Promise<string>
    onProgress?: (message: string) => void
}

export interface PackedCliSessionReport {
    nuxt: string
    cli: string
    disconnectAbort:
        | { status: 'propagated'; signalIdentity: true; normalRequestsAborted: false }
        | {
              status: 'upstream-limitation'
              signalIdentity: true
              normalRequestsAborted: false
              observedSignalAborted: false
              source: '@nuxt/nitro-server/dist/runtime/utils/event.mjs:toWebRequest$1'
              detail: string
          }
}

const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))
const exists = async (path: string): Promise<boolean> => {
    try {
        await access(path)
        return true
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
        throw error
    }
}
const generatedRoots = (directory: string) => [
    resolve(directory, '.nuxt'),
    resolve(directory, 'node_modules/.cache/nuxt/.nuxt'),
    resolve(directory, 'node_modules/.nitro'),
]

/** Exercise the real CLI without Vitest's test-mode fork/watcher overrides. */
export const nuxtCliEnvironment = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => {
    const env = { ...process.env }
    for (const name of Object.keys(env)) if (/^(?:VITEST|VITE_NODE|NUXT_TEST)/u.test(name)) delete env[name]
    for (const name of ['NODE_OPTIONS', 'FILES_API_SECRET', 'NUXT_IGNORE_LOCK', 'NUXT_LOCK']) delete env[name]
    return {
        ...env,
        NODE_ENV: 'development',
        NUXT_DEV_FORK_POOL_SIZE: '0',
        NITRO_NO_UNIX_SOCKET: '1',
        NUXT_TELEMETRY_DISABLED: '1',
        FORCE_COLOR: '0',
        ...overrides,
    }
}

const withEnvironment = async <T>(env: NodeJS.ProcessEnv, action: () => Promise<T>): Promise<T> => {
    const previous = { ...process.env }
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name]
    Object.assign(process.env, env)
    try {
        return await action()
    } finally {
        for (const name of Object.keys(process.env)) if (!(name in previous)) delete process.env[name]
        Object.assign(process.env, previous)
    }
}

const run = (command: string, args: string[], cwd: string, env = process.env, timeout = 120_000): Promise<string> =>
    new Promise((done, fail) => {
        const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], timeout })
        let output = ''
        child.stdout.on('data', (chunk) => (output += chunk))
        child.stderr.on('data', (chunk) => (output += chunk))
        child.once('error', fail)
        child.once('close', (code) =>
            code === 0 ? done(output) : fail(new Error(`${command} exited ${code}.\n${output}`)),
        )
    })

const eventually = async <T>(name: string, action: () => Promise<T | undefined>, budget = 90_000): Promise<T> => {
    const deadline = Date.now() + budget
    while (Date.now() < deadline) {
        const value = await action()
        if (value !== undefined) return value
        await wait(100)
    }
    throw new Error(`Timed out: ${name}`)
}

const allocatePort = async (): Promise<number> => {
    const socket = createServer()
    await new Promise<void>((done, fail) => {
        socket.once('error', fail)
        socket.listen(0, '127.0.0.1', done)
    })
    const address = socket.address()
    assert(address && typeof address !== 'string')
    await new Promise<void>((done) => socket.close(() => done()))
    return address.port
}

const alive = (pid: number): boolean => {
    try {
        process.kill(pid, 0)
        return true
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
        throw error
    }
}

/** Capture the owned tree before native shutdown; cleanup failures remain test failures. */
const closeOwnedCli = async (child: ChildProcess, reported: Set<number>, directory: string): Promise<void> => {
    const errors: string[] = []
    const owned = new Set<number>(reported)
    if (child.pid) owned.add(child.pid)
    try {
        if (process.platform === 'win32') {
            const listing = JSON.parse(
                await run(
                    'powershell.exe',
                    [
                        '-NoProfile',
                        '-NonInteractive',
                        '-Command',
                        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress',
                    ],
                    directory,
                    process.env,
                    10_000,
                ),
            ) as { ProcessId: number; ParentProcessId: number }[]
            let changed = true
            while (changed) {
                changed = false
                for (const row of listing)
                    if (owned.has(row.ParentProcessId) && !owned.has(row.ProcessId)) {
                        owned.add(row.ProcessId)
                        changed = true
                    }
            }
        } else {
            const listing = await run('ps', ['-eo', 'pid=,pgid='], directory, process.env, 10_000)
            for (const row of listing.trim().split('\n')) {
                const [pid, group] = row.trim().split(/\s+/u).map(Number)
                if (pid && group === child.pid) owned.add(pid)
            }
        }
    } catch (error) {
        errors.push(`Owned-process enumeration failed: ${String(error)}`)
    }
    const exited = () => child.exitCode !== null || child.signalCode !== null
    if (!exited()) {
        if (child.connected) {
            await new Promise<void>((done) => {
                const timeout = setTimeout(() => {
                    errors.push('Native shutdown IPC send timed out')
                    done()
                }, 2000)
                try {
                    child.send('files-cli-stop', (error) => {
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
        } else if (process.platform !== 'win32') child.kill('SIGTERM')
        else errors.push('Windows native shutdown IPC channel is unavailable')
    }
    const deadline = Date.now() + 20_000
    while ((!exited() || [...owned].some(alive)) && Date.now() < deadline) await wait(100)
    if (!exited() || [...owned].some(alive)) {
        errors.push('Native CLI shutdown exceeded its cleanup deadline')
        if (process.platform === 'win32' && child.pid) {
            try {
                await run('taskkill', ['/PID', String(child.pid), '/T', '/F'], directory, process.env, 10_000)
            } catch (error) {
                errors.push(`Scoped Windows fallback failed: ${String(error)}`)
            }
        } else if (child.pid) {
            try {
                process.kill(-child.pid, 'SIGKILL')
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ESRCH') errors.push(String(error))
            }
        }
    }
    try {
        await eventually(
            'owned CLI processes disappear',
            async () => ([...owned].every((pid) => !alive(pid)) ? true : undefined),
            10_000,
        )
    } catch (error) {
        errors.push(String(error))
    }
    if (errors.length) throw new Error(errors.join('\n'))
}

const scanSecrets = async (directory: string, secrets: string[]): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue
        const path = resolve(directory, entry.name)
        if (entry.isDirectory()) await scanSecrets(path, secrets)
        else if (entry.isFile()) {
            const contents = await readFile(path)
            assert(
                secrets.every((secret) => !contents.includes(Buffer.from(secret))),
                `Canary leaked in ${entry.name}`,
            )
        }
    }
}

const scanConsumer = async (directory: string, secrets: string[]) => {
    await scanSecrets(directory, secrets)
    for (const root of generatedRoots(directory)) if (await exists(root)) await scanSecrets(root, secrets)
}

const nuxtConfiguration = (revision: number) => `export default defineNuxtConfig({
  compatibilityDate: '2026-09-04', modules: ['nuxt-files-sdk'], devtools: { enabled: false },
  runtimeConfig: { appSecret: '', cliRevision: ${revision} },
})\n`

const authorization = (
    user: string,
    dependency = false,
) => `${dependency ? "import isNumber from 'files-cli-late-number'\n" : ''}
import { FilesError } from '#files-sdk'
export const authorize = async ({ req, event, operation }) => {
  const state = globalThis[Symbol.for('files-cli-state')]
  const user = req.headers.get('x-files-user')
  if (req !== event.req || req.signal !== event.req.signal || req.signal !== event.context.cliSignal) throw new Error('Native Request/signal identity failed')
  if (!(req.signal instanceof AbortSignal) || !(event.url instanceof URL) || event.url.href !== req.url) throw new Error('Native URL or signal type failed')
  if (event.context.cliUser !== user || event.req.headers.get('x-files-user') !== user) throw new Error('Request header/context isolation failed')
  const body = req.method === 'POST' ? await req.clone().json() : undefined
  if (body && typeof body.op !== 'string') throw new Error('Native request body was lost')
  state.observations.push({ user, operation, bodyOp: body?.op, path: event.url.pathname, selector: event.url.searchParams.get('selector') })
  event.res.headers.set('x-files-policy', 'portable-' + user)
  if (event.url.searchParams.get('abort') === 'yes') {
    state.abortStarted = true
    await new Promise(done => {
      const finish = () => { state.abortFinished = true; state.abortObserved = req.signal.aborted; done(undefined) }
      if (req.signal.aborted) finish()
      else { req.signal.addEventListener('abort', finish, { once: true }); setTimeout(finish, 1000).unref?.() }
    })
  } else state.normalSignals.push(req.signal)
  ${dependency ? "if (!isNumber(7)) throw new Error('Installed dependency was not reloaded')" : ''}
  if (user !== ${JSON.stringify(user)}) throw new FilesError('Unauthorized', 'Denied by session policy')
}
`

const filesConfiguration = `import { authorize } from './policy'
export default defineFilesConfig({
  storage: {
    archive: { adapter: 'memory', hooks: { onAction: () => globalThis[Symbol.for('files-cli-state')].order.push('user') } },
    blob: { adapter: 'memory' },
  },
  routes: [
    { path: '/api/route-a', storage: 'archive', secret: process.env.FILES_ROUTE_SECRET!, authorize },
    { path: '/api/route-b', storage: 'blob', secret: process.env.FILES_ROUTE_SECRET!, authorize },
    { path: '/api/route-c', storage: 'archive', authorize },
  ],
})\n`

const plugin = `import { Files } from '#files-sdk'
import { useServerFiles } from 'nuxt-files-sdk/runtime'
export default defineNitroPlugin(nitroApp => {
  const state = globalThis[Symbol.for('files-cli-state')] = { observations: [], order: [], actions: 0, normalSignals: [], abortStarted: false, abortFinished: false, abortObserved: false }
  state.early = useServerFiles('archive')
  state.earlyOwned = state.early instanceof Files
  nitroApp.hooks.hook('files:action', () => { state.actions++; state.order.push('bridge') })
})\n`

const metadataHandler = `import { Files } from '#files-sdk'
import { useServerFiles } from 'nuxt-files-sdk/runtime'
import { defineEventHandler, useRuntimeConfig } from 'nuxt/server'
export default defineEventHandler(() => {
  const state = globalThis[Symbol.for('files-cli-state')]
  const { early, normalSignals, ...metadata } = state
  const client = useServerFiles('archive')
  return { ...metadata, pid: process.pid, revision: useRuntimeConfig().cliRevision,
    normalRequestsAborted: normalSignals.some(signal => signal.aborted),
    appSecretMatchesRuntime: useRuntimeConfig().appSecret === process.env.NUXT_APP_SECRET,
    owned: client instanceof Files, reused: client === useServerFiles('archive'), earlyReused: client === early }
})\n`

const gateway = async (url: string, body: object, user = 'alice') => {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-files-user': user },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
    })
    const text = await response.text()
    let payload: Record<string, any>
    try {
        payload = JSON.parse(text) as Record<string, any>
    } catch {
        payload = { message: text }
    }
    return { status: response.status, headers: response.headers, body: payload }
}

const chunkedGateway = (url: string): Promise<{ status: number; body: Record<string, any> }> =>
    new Promise((done, fail) => {
        const outgoing = request(
            url,
            { method: 'POST', headers: { 'content-type': 'application/json', 'x-files-user': 'alice' } },
            (response) => {
                let body = ''
                response.on('data', (chunk) => (body += chunk))
                response.once('end', () => {
                    try {
                        done({ status: response.statusCode!, body: JSON.parse(body) })
                    } catch (error) {
                        fail(error)
                    }
                })
            },
        )
        outgoing.once('error', fail)
        outgoing.setTimeout(15_000, () => outgoing.destroy(new Error('Chunked JSON request timed out')))
        outgoing.write('{"op":')
        setTimeout(() => outgoing.end('"list"}'), 20)
    })

const nativeUpload = async (base: string, path: string) => {
    const endpoint = `${base}${path}?selector=archive`
    const presign = await gateway(endpoint, {
        op: 'presign',
        files: [{ name: 'round-trip.txt', size: 5, type: 'text/plain' }],
    })
    assert.equal(presign.status, 200)
    const upload = presign.body.uploads[0] as {
        id: string
        key: string
        target: { method: string; url: string; headers: Record<string, string> }
    }
    assert.equal(upload.target.method, 'PUT')
    const response = await fetch(upload.target.url, {
        method: 'PUT',
        headers: { ...upload.target.headers, 'x-files-user': 'alice' },
        body: 'hello',
        signal: AbortSignal.timeout(15_000),
    })
    assert.equal(response.status, 200, 'The native memory proxy target accepts its own token')
    const complete = await gateway(endpoint, { op: 'complete', completions: [{ id: upload.id, key: upload.key }] })
    assert.equal(complete.status, 200)
    assert.equal(complete.body.errors, undefined)
    assert.equal(complete.body.files[0].key, upload.key)
    assert.equal(complete.body.files[0].size, 5)
    return upload
}

/** The callbacks retain the selected package manager; the archive is never rebuilt. */
export const runPackedNuxtCliSession = async ({
    consumer,
    install,
    runScript,
    onProgress,
}: SessionOptions): Promise<PackedCliSessionReport> => {
    const directory = resolve(dirname(consumer), `nuxt-cli-${randomUUID()}`)
    const manifest = JSON.parse(await readFile(resolve(consumer, 'package.json'), 'utf8'))
    const dependency = manifest.dependencies['nuxt-files-sdk'] as string
    assert(dependency.startsWith('file:'), 'CLI verification requires the already packed archive')
    const archive = resolve(consumer, dependency.slice(5))
    const digest = createHash('sha256')
        .update(await readFile(archive))
        .digest('hex')
    const canaries = Array.from({ length: 4 }, () => `files-cli-${randomUUID()}-${randomUUID()}`)
    const redact = (text: string) => canaries.reduce((value, secret) => value.replaceAll(secret, '[redacted]'), text)
    const preparedEnv = nuxtCliEnvironment({ FILES_ROUTE_SECRET: canaries[0], NUXT_APP_SECRET: canaries[1] })
    const runtimeEnv = nuxtCliEnvironment({ FILES_ROUTE_SECRET: canaries[2], NUXT_APP_SECRET: canaries[3] })
    let child: ChildProcess | undefined
    let port: number | undefined
    let log = ''
    let lastHttpFailure = ''
    let report: PackedCliSessionReport | undefined
    const pids = new Set<number>()
    const failures: string[] = []
    try {
        await mkdir(directory, { recursive: true })
        manifest.type = 'module'
        manifest.dependencies['nuxt-files-sdk'] = `file:${archive.replaceAll('\\', '/')}`
        manifest.scripts = { prepare: 'nuxt prepare', build: 'nuxt build' }
        await writeFile(resolve(directory, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
        const npmrc = resolve(consumer, '.npmrc')
        if (await exists(npmrc)) await writeFile(resolve(directory, '.npmrc'), await readFile(npmrc))
        for (const path of ['server/api', 'server/plugins', 'server/middleware'])
            await mkdir(resolve(directory, path), { recursive: true })
        await writeFile(resolve(directory, 'nuxt.config.ts'), nuxtConfiguration(1))
        await writeFile(resolve(directory, 'files.config.ts'), filesConfiguration)
        await writeFile(resolve(directory, 'policy.ts'), authorization('alice'))
        await writeFile(resolve(directory, 'server/plugins/00-files.ts'), plugin)
        await writeFile(resolve(directory, 'server/api/session.get.ts'), metadataHandler)
        await writeFile(
            resolve(directory, 'server/middleware/context.ts'),
            `import { defineEventHandler } from 'nuxt/server'\nexport default defineEventHandler(event => { event.context.cliUser = event.req.headers.get('x-files-user'); event.context.cliSignal = event.req.signal })\n`,
        )
        const installed = await withEnvironment(preparedEnv, () => install(directory))
        assert(
            canaries.every((secret) => !installed.includes(secret)),
            'Installation log contains no secret',
        )
        const versions = JSON.parse(
            await run(
                'node',
                [
                    '--input-type=module',
                    '-e',
                    `import { createRequire } from 'node:module'; import { readFileSync } from 'node:fs'; import { pathToFileURL, fileURLToPath } from 'node:url'; const r=createRequire(import.meta.url); const n=r.resolve('nuxt/package.json'); const c=createRequire(n); const cli=c.resolve('@nuxt/cli/cli'); console.log(JSON.stringify({ nuxt: JSON.parse(readFileSync(n,'utf8')).version, cli: JSON.parse(readFileSync(new URL('../package.json',pathToFileURL(cli)),'utf8')).version, bin: fileURLToPath(new URL('./bin/nuxt.mjs',pathToFileURL(n))), adapter: c.resolve('@nuxt/nitro-server/package.json') }))`,
                ],
                directory,
                preparedEnv,
            ),
        ) as { nuxt: string; cli: string; bin: string; adapter: string }
        const [major, minor] = versions.nuxt.split('.').map(Number)
        assert(major === 4 && minor !== undefined && minor >= 6, 'Use supported stable Nuxt 4.6 or later')
        assert.match(versions.cli, /^4\./u, 'Use installed CLI 4')
        for (const script of ['prepare', 'build']) {
            const output = await withEnvironment(preparedEnv, () => runScript(directory, script))
            assert(
                canaries.every((secret) => !output.includes(secret)),
                `${script} log contains no secret`,
            )
        }
        await scanConsumer(directory, canaries)
        onProgress?.('Exact archive prepared and built; secret scans passed')
        port = await allocatePort()
        const base = `http://127.0.0.1:${port}`
        const bootstrap = resolve(directory, '.files-cli-bootstrap.mjs')
        // A file bootstrap keeps --input-type eval flags out of Nitro's worker execArgv.
        await writeFile(
            bootstrap,
            `import { pathToFileURL } from 'node:url'\nconst [bin, ...args] = process.argv.slice(2)\nprocess.argv = [process.execPath, bin, ...args]\nprocess.on('message', message => { if (message === 'files-cli-stop') process.emit('SIGTERM') })\nawait import(pathToFileURL(bin).href)\n`,
        )
        child = spawn(
            'node',
            [
                bootstrap,
                versions.bin,
                'dev',
                '--fork',
                '--no-tui',
                '--port',
                String(port),
                '--strictPort',
                '--host',
                '127.0.0.1',
            ],
            {
                cwd: directory,
                env: runtimeEnv,
                detached: process.platform !== 'win32',
                stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
            },
        )
        let spawnError: Error | undefined
        child.once('error', (error) => (spawnError = error))
        child.stdout!.on('data', (chunk) => (log += chunk))
        child.stderr!.on('data', (chunk) => (log += chunk))
        const status = async (): Promise<Record<string, any> | undefined> => {
            if (spawnError) throw spawnError
            if (child!.exitCode !== null || child!.signalCode !== null)
                throw new Error('Real Nuxt CLI exited before completion')
            try {
                const response = await fetch(`${base}/api/session`, { signal: AbortSignal.timeout(1500) })
                if (response.ok) return response.json()
                lastHttpFailure = `HTTP ${response.status}: ${(await response.text()).slice(0, 8000)}`
            } catch (error) {
                lastHttpFailure = String(error)
            }
            return undefined
        }
        let current = await eventually('real forked CLI readiness', status, 120_000)
        pids.add(current.pid)
        const assertIdentity = (value: Record<string, any>) => {
            for (const name of ['earlyOwned', 'owned', 'reused', 'earlyReused', 'appSecretMatchesRuntime'])
                assert.equal(value[name], true, name)
        }
        assertIdentity(current)
        assert.equal(current.revision, 1)
        const endpoint = `${base}/api/route-a?selector=archive`
        const first = await gateway(endpoint, { op: 'list' })
        assert.equal(first.status, 200)
        assert.deepEqual(first.body, { items: [] })
        assert.equal(
            first.headers.get('x-files-policy'),
            'portable-alice',
            'Portable response headers survive the native returned Response',
        )
        const curl = () =>
            run(
                'node',
                [
                    versions.bin,
                    'curl',
                    '/api/route-a?selector=archive',
                    '--no-pretty',
                    '-H',
                    'x-files-user: alice',
                    '-d',
                    '{"op":"list"}',
                ],
                directory,
                runtimeEnv,
            )
        assert.deepEqual(
            JSON.parse((await curl()).trim()),
            first.body,
            'Real nuxt curl discovers the same native gateway',
        )
        assert.deepEqual(await chunkedGateway(endpoint), { status: 200, body: first.body })
        const malformed = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-files-user': 'alice' },
            body: '{broken',
            signal: AbortSignal.timeout(15_000),
        })
        assert.equal(malformed.status, 422, 'Native malformed JSON rejection is retained')
        const parallel = await Promise.all(
            Array.from({ length: 8 }, (_, index) => gateway(endpoint, { op: 'list' }, index % 2 ? 'mallory' : 'alice')),
        )
        assert.deepEqual(
            parallel.map((value) => value.status),
            [200, 401, 200, 401, 200, 401, 200, 401],
        )
        const upload = await nativeUpload(base, '/api/route-a')
        await nativeUpload(base, '/api/route-c')
        for (const replay of ['/api/route-b?selector=archive', '/api/route-a?selector=blob']) {
            const changed = new URL(replay, base)
            const target = new URL(upload.target.url)
            target.pathname = changed.pathname
            target.searchParams.set('selector', changed.searchParams.get('selector')!)
            const denied = await fetch(target, {
                method: 'PUT',
                headers: { ...upload.target.headers, 'x-files-user': 'alice' },
                body: 'hello',
                signal: AbortSignal.timeout(15_000),
            })
            assert.equal(denied.status, 401, 'Native endpoint/query-bound token rejects proxy replay')
            const completion = await gateway(changed.href, {
                op: 'complete',
                completions: [{ id: upload.id, key: upload.key }],
            })
            assert.equal(completion.status, 200)
            assert.deepEqual(completion.body.files, [])
            assert.equal(
                completion.body.errors[0].error.code,
                'Unauthorized',
                'Native completion rejects the same replay',
            )
        }
        assert.deepEqual((await gateway(`${base}/api/route-b?selector=archive`, { op: 'list' })).body.items, [])
        current = await eventually('native request metadata', status)
        assert.deepEqual(current.order.slice(0, 2), ['user', 'bridge'], 'User hook precedes the native Nitro bridge')
        assert(current.actions > 0)
        assert(
            current.observations.some(
                (value: any) =>
                    value.operation === 'list' &&
                    value.bodyOp === 'list' &&
                    value.path === '/api/route-a' &&
                    value.selector === 'archive',
            ),
        )
        assert.equal(
            current.normalRequestsAborted,
            false,
            'Ordinary completion never prematurely aborts native signals',
        )
        const controller = new AbortController()
        const cancelled = fetch(`${endpoint}&abort=yes`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-files-user': 'alice' },
            body: '{"op":"list"}',
            signal: controller.signal,
        }).then(
            () => false,
            (error: unknown) => (error as Error).name === 'AbortError',
        )
        await eventually('real disconnect probe reached authorize', async () =>
            (await status())?.abortStarted ? true : undefined,
        )
        controller.abort()
        assert.equal(await cancelled, true, 'The real client request was aborted')
        const observed = await eventually(
            'disconnect observation settles',
            async () => {
                const value = await status()
                return value?.abortFinished ? value : undefined
            },
            10_000,
        )
        let disconnectAbort: PackedCliSessionReport['disconnectAbort']
        if (observed.abortObserved)
            disconnectAbort = { status: 'propagated', signalIdentity: true, normalRequestsAborted: false }
        else {
            const source = await readFile(resolve(dirname(versions.adapter), 'dist/runtime/utils/event.mjs'), 'utf8')
            const adapter = source.slice(
                source.indexOf('function toWebRequest$1('),
                source.indexOf('function toBufferedBodyStream('),
            )
            assert(
                adapter.startsWith('function toWebRequest$1(') &&
                    !adapter.includes('signal:') &&
                    !adapter.includes('AbortController'),
                'Verify the installed upstream adapter before classifying the observed disconnect limitation',
            )
            disconnectAbort = {
                status: 'upstream-limitation',
                signalIdentity: true,
                normalRequestsAborted: false,
                observedSignalAborted: false,
                source: '@nuxt/nitro-server/dist/runtime/utils/event.mjs:toWebRequest$1',
                detail: 'Native Request/signal forwarding passed. Real client disconnect did not cancel the Nuxt Nitro 2 portable Request; its installed adapter creates Request without a signal/disconnect listener.',
            }
        }
        report = { nuxt: versions.nuxt, cli: versions.cli, disconnectAbort }
        onProgress?.(
            `Native HTTP/curl, RequestEvent, hooks and endpoint binding passed; disconnect: ${disconnectAbort.status}`,
        )
        await scanConsumer(directory, canaries)
        assert(
            canaries.every((secret) => !JSON.stringify(current).includes(secret) && !log.includes(secret)),
            'Native metadata and CLI logs contain no secret',
        )
    } catch (error) {
        failures.push(String(error))
    } finally {
        if (child) {
            try {
                await closeOwnedCli(child, pids, directory)
            } catch (error) {
                failures.push(`CLI cleanup: ${String(error)}`)
            }
            for (const root of generatedRoots(directory))
                if (await exists(resolve(root, 'nuxt.lock')))
                    failures.push(`Native CLI did not remove its own lock in ${root}`)
            if (port !== undefined) {
                const socket = createServer()
                try {
                    await new Promise<void>((done, fail) => {
                        socket.once('error', fail)
                        socket.listen(port, '127.0.0.1', done)
                    })
                    await new Promise<void>((done) => socket.close(() => done()))
                } catch (error) {
                    failures.push(`Owned listener cleanup: ${String(error)}`)
                }
            }
        }
        if (
            createHash('sha256')
                .update(await readFile(archive))
                .digest('hex') !== digest
        )
            failures.push('The exact archive changed')
        await rm(directory, { recursive: true, force: true })
    }
    if (failures.length)
        throw new Error(redact(`${failures.join('\n')}\nLast HTTP failure: ${lastHttpFailure}\nCLI output:\n${log}`))
    assert(report)
    onProgress?.('Owned processes, listener and lock cleaned; archive digest unchanged')
    return report
}
