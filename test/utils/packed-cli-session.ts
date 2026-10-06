import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'

import { closeOwnedProcess, runCommand } from './fixture'

interface SessionOptions {
    consumer: string
    install: (directory: string, options?: { signal?: AbortSignal; timeout?: number }) => Promise<string>
    runScript: (
        directory: string,
        script: string,
        options?: { signal?: AbortSignal; timeout?: number },
    ) => Promise<string>
    onProgress?: (message: string) => void
}

export interface PackedCliSessionReport {
    nuxt: string
    cli: string
    localReferenceUpdated: true
    aliasLayerRelativeUpdated: true
    installOnlyRecovery: true
    npmHiddenMetadataChanged: boolean
    configReload: { kind: 'soft'; revision: 2; pidUnchanged: true }
    hardRestart: { trigger: 'dotenv-marker'; revision: 2; pidChanged: true; urlRetained: true; curlDiscovery: true }
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

const assertIdentity = (value: Record<string, any>) => {
    for (const name of ['earlyOwned', 'owned', 'reused', 'earlyReused', 'appSecretMatchesRuntime'])
        assert.equal(value[name], true, name)
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

const run = (
    command: string,
    args: string[],
    cwd: string,
    env = process.env,
    timeout = 120_000,
    signal?: AbortSignal,
) => runCommand(command, args, { cwd, env, timeout, ...(signal ? { signal } : {}) })

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

/** Native CLI shutdown uses its file-bootstrap IPC; shared cleanup verifies the captured tree. */
const closeOwnedCli = (child: ChildProcess, reported: Set<number>, directory: string) =>
    closeOwnedProcess(child, { cwd: directory, reported, ipcMessage: 'files-cli-stop' })

const scanSecrets = async (directory: string, secrets: string[], installedRoot?: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name)
        if (path === installedRoot || entry.name === '.git') continue
        if (entry.isDirectory()) await scanSecrets(path, secrets, installedRoot)
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
    await scanSecrets(directory, secrets, resolve(directory, 'node_modules'))
    for (const root of generatedRoots(directory)) if (await exists(root)) await scanSecrets(root, secrets)
}

const nuxtConfiguration = (revision: number) => `export default defineNuxtConfig({
  compatibilityDate: '2026-09-04',
  modules: ['nuxt-files-sdk', function filesCliLifecycle(_options, nuxt) {
    const started = Date.now()
    const observe = (scope, hooks) => {
      const emit = (phase, event) => {
        if (['close', 'restart', 'ready', 'nitro:init', 'nitro:config', 'build:before', 'build:done', 'dev:reload'].includes(event.name))
          console.info('[Files CLI lifecycle] ' + JSON.stringify({ scope, phase, hook: event.name, pid: process.pid, ms: Date.now() - started }))
      }
      hooks.beforeEach(event => emit('before', event))
      hooks.afterEach(event => emit('after', event))
    }
    observe('nuxt', nuxt.hooks)
    nuxt.hook('nitro:init', nitro => observe('nitro', nitro.hooks))
  }],
  devtools: { enabled: false },
  extends: ['./layer'],
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
        headers: { accept: 'application/json', 'content-type': 'application/json', 'x-files-user': user },
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
    const deadlineAt = Date.now() + 450_000
    const deadline = new AbortController()
    let shutdown: Promise<void> | undefined
    const stop = () => {
        if (!child) return Promise.resolve()
        return (shutdown ??= closeOwnedCli(child, pids, directory))
    }
    const abortSession = () => {
        deadline.abort()
        void stop().catch((error: unknown) => failures.push(`Deadline cleanup: ${String(error)}`))
    }
    const deadlineTimer = setTimeout(abortSession, 450_000)
    deadlineTimer.unref()
    const commandOptions = () => ({
        signal: deadline.signal,
        timeout: Math.max(1, Math.min(290_000, deadlineAt - Date.now())),
    })
    const sessionPoll = <T>(label: string, action: () => Promise<T | undefined>, budget = 90_000): Promise<T> =>
        eventually(
            label,
            async () => {
                if (deadline.signal.aborted) throw new Error('Packed CLI session exceeded its bounded deadline')
                return action()
            },
            Math.max(1, Math.min(budget, deadlineAt - Date.now())),
        )
    try {
        await mkdir(directory, { recursive: true })
        manifest.type = 'module'
        manifest.dependencies['nuxt-files-sdk'] = `file:${archive.replaceAll('\\', '/')}`
        manifest.scripts = { prepare: 'nuxt prepare', build: 'nuxt build' }
        await writeFile(resolve(directory, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
        const npmrc = resolve(consumer, '.npmrc')
        if (await exists(npmrc)) await writeFile(resolve(directory, '.npmrc'), await readFile(npmrc))
        for (const path of ['server/api', 'server/plugins', 'server/middleware', 'layer'])
            await mkdir(resolve(directory, path), { recursive: true })
        await writeFile(resolve(directory, 'nuxt.config.ts'), nuxtConfiguration(1))
        await writeFile(
            resolve(directory, 'layer/nuxt.config.ts'),
            `import { fileURLToPath } from 'node:url'\nexport default defineNuxtConfig({ alias: { '@files-cli-layer': fileURLToPath(new URL('.', import.meta.url)) } })\n`,
        )
        await writeFile(resolve(directory, 'layer/index.ts'), "export { authorize } from './permission'\n")
        await writeFile(resolve(directory, 'layer/permission.ts'), authorization('carol'))
        await writeFile(resolve(directory, 'files.config.ts'), filesConfiguration)
        await writeFile(resolve(directory, 'policy.ts'), authorization('alice'))
        await writeFile(resolve(directory, 'server/plugins/00-files.ts'), plugin)
        await writeFile(resolve(directory, 'server/api/session.get.ts'), metadataHandler)
        await writeFile(
            resolve(directory, 'server/middleware/context.ts'),
            `import { defineEventHandler } from 'nuxt/server'\nexport default defineEventHandler(event => { event.context.cliUser = event.req.headers.get('x-files-user'); event.context.cliSignal = event.req.signal })\n`,
        )
        const installed = await withEnvironment(preparedEnv, () => install(directory, commandOptions()))
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
                    `import { createRequire } from 'node:module'; import { readFileSync } from 'node:fs'; import { pathToFileURL, fileURLToPath } from 'node:url'; const r=createRequire(import.meta.url); const n=r.resolve('nuxt/package.json'); const c=createRequire(n); const cli=c.resolve('@nuxt/cli/cli'); const adapter=c.resolve('@nuxt/nitro-server/package.json'); console.log(JSON.stringify({ node: process.version, nuxt: JSON.parse(readFileSync(n,'utf8')).version, cli: JSON.parse(readFileSync(new URL('../package.json',pathToFileURL(cli)),'utf8')).version, nitro: JSON.parse(readFileSync(createRequire(adapter).resolve('nitropack/package.json'),'utf8')).version, bin: fileURLToPath(new URL('./bin/nuxt.mjs',pathToFileURL(n))), adapter }))`,
                ],
                directory,
                preparedEnv,
                120_000,
                deadline.signal,
            ),
        ) as { node: string; nuxt: string; cli: string; nitro: string; bin: string; adapter: string }
        console.info(
            '[Packed Nuxt CLI versions]',
            JSON.stringify({ node: versions.node, nuxt: versions.nuxt, cli: versions.cli, nitro: versions.nitro }),
        )
        const [major, minor] = versions.nuxt.split('.').map(Number)
        assert(major === 4 && minor !== undefined && minor >= 6, 'Use supported stable Nuxt 4.6 or later')
        assert.match(versions.cli, /^4\./u, 'Use installed CLI 4')
        for (const script of ['prepare', 'build']) {
            const output = await withEnvironment(preparedEnv, () => runScript(directory, script, commandOptions()))
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
                const response = await fetch(`${base}/api/session`, {
                    headers: { accept: 'application/json' },
                    signal: AbortSignal.timeout(1500),
                })
                if (response.ok) return response.json()
                lastHttpFailure = `HTTP ${response.status}: ${(await response.text()).slice(0, 8000)}`
            } catch (error) {
                lastHttpFailure = String(error)
            }
            return undefined
        }
        let current = await sessionPoll('real forked CLI readiness', status, 120_000)
        pids.add(current.pid)
        assertIdentity(current)
        assert.equal(current.revision, 1)
        const endpoint = `${base}/api/route-a?selector=archive`
        const first = await gateway(endpoint, { op: 'list' })
        assert.equal(first.status, 200, `Initial Gateway response: ${JSON.stringify(first.body)}`)
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
                120_000,
                deadline.signal,
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
        current = await sessionPoll('native request metadata', status)
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
        await sessionPoll('real disconnect probe reached authorize', async () =>
            (await status())?.abortStarted ? true : undefined,
        )
        controller.abort()
        assert.equal(await cancelled, true, 'The real client request was aborted')
        const observed = await sessionPoll(
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
        onProgress?.(
            `Native HTTP/curl, RequestEvent, hooks and endpoint binding passed; disconnect: ${disconnectAbort.status}`,
        )
        const awaitGateway = (label: string, user: string, healthy: boolean) =>
            sessionPoll(label, async () => {
                const result = await gateway(endpoint, { op: 'list' }, user).catch((error: unknown) => {
                    lastHttpFailure = String(error)
                    return undefined
                })
                if (result && result.status !== 200)
                    lastHttpFailure = `HTTP ${result.status}: ${JSON.stringify(result.body).slice(0, 8000)}`
                return result && (healthy ? result.status === 200 : result.status >= 500) ? true : undefined
            })
        // Refresh a directly referenced local policy, with no files.config save as a trigger.
        await writeFile(resolve(directory, 'policy.ts'), authorization('bob'))
        await awaitGateway('local policy refresh', 'bob', true)
        assert.equal((await gateway(endpoint, { op: 'list' }, 'alice')).status, 401)
        const syntaxOffset = log.length
        await writeFile(resolve(directory, 'policy.ts'), 'export const authorize = (\n')
        await awaitGateway('syntax error fails closed', 'bob', false)
        await sessionPoll('syntax error reached the real evaluator', async () =>
            /Unexpected|ParseError|Transform failed/u.test(log.slice(syntaxOffset)) ? true : undefined,
        )
        await writeFile(resolve(directory, 'policy.ts'), authorization('alice'))
        await awaitGateway('syntax correction resumes native requests', 'alice', true)
        const invalid = filesConfiguration.replace("storage: 'blob'", "storage: 'missing'")
        const invalidOffset = log.length
        await writeFile(resolve(directory, 'files.config.ts'), invalid)
        await awaitGateway('invalid route storage fails closed', 'alice', false)
        await sessionPoll('invalid storage reached configuration validation', async () =>
            log.slice(invalidOffset).includes('[nuxt-files-sdk:unknown-storage]') ? true : undefined,
        )
        await writeFile(resolve(directory, 'files.config.ts'), filesConfiguration)
        await awaitGateway('configuration correction resumes native requests', 'alice', true)
        // The layer supplies the alias; its export adds a relative graph edge.
        await writeFile(resolve(directory, 'policy.ts'), "export { authorize } from '@files-cli-layer/index'\n")
        await awaitGateway('layer alias graph is active', 'carol', true)
        assert.equal((await gateway(endpoint, { op: 'list' }, 'alice')).status, 401)
        await writeFile(resolve(directory, 'layer/permission.ts'), authorization('bob'))
        await awaitGateway('layer relative policy refresh', 'bob', true)
        assert.equal((await gateway(endpoint, { op: 'list' }, 'alice')).status, 401)
        // A newly referenced module must join the watch graph, not just the initial sources.
        await writeFile(resolve(directory, 'layer/next-permission.ts'), authorization('dana'))
        await writeFile(resolve(directory, 'layer/index.ts'), "export { authorize } from './next-permission'\n")
        await awaitGateway('new referenced graph edge', 'dana', true)
        assert.equal((await gateway(endpoint, { op: 'list' }, 'bob')).status, 401)
        await writeFile(resolve(directory, 'layer/next-permission.ts'), authorization('alice'))
        await awaitGateway('new relative source is watched', 'alice', true)
        // Keep the configuration broken until install alone makes this dependency available.
        const dependencyOffset = log.length
        await writeFile(resolve(directory, 'layer/next-permission.ts'), authorization('alice', true))
        await awaitGateway('missing dependency fails closed', 'alice', false)
        await sessionPoll('missing import reached the native resolver', async () =>
            /(?:Cannot find|could not be resolved|Failed to resolve)[^\n]*files-cli-late-number|files-cli-late-number[^\n]*(?:could not be resolved|Cannot find)/u.test(
                log.slice(dependencyOffset),
            )
                ? true
                : undefined,
        )
        const late = resolve(directory, '.late-dependency')
        await mkdir(late, { recursive: true })
        await writeFile(
            resolve(late, 'package.json'),
            JSON.stringify({ name: 'files-cli-late-number', version: '1.0.0', type: 'module', exports: './index.js' }),
        )
        await writeFile(resolve(late, 'index.js'), "export default value => typeof value === 'number'\n")
        const metadataPath = resolve(directory, 'node_modules/.package-lock.json')
        const metadataBefore = (await exists(metadataPath)) ? await readFile(metadataPath, 'utf8') : undefined
        manifest.dependencies['files-cli-late-number'] = 'file:.late-dependency'
        await writeFile(resolve(directory, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
        const installation = await withEnvironment(runtimeEnv, () => install(directory, commandOptions()))
        assert(
            canaries.every((secret) => !installation.includes(secret)),
            'Dependency install log contains no secret',
        )
        const metadataAfter = (await exists(metadataPath)) ? await readFile(metadataPath, 'utf8') : undefined
        const npmHiddenMetadataChanged = metadataAfter !== undefined && metadataBefore !== metadataAfter
        if (metadataBefore !== undefined)
            assert(
                npmHiddenMetadataChanged,
                'npm install updates its hidden completion metadata even when the root lockfile is disabled',
            )
        await awaitGateway('dependency addition without another edit', 'alice', true)
        onProgress?.('Local and alias/layer graph refresh, syntax/config repair, and install-only recovery passed')
        current = await sessionPoll('metadata before configuration reload', status)
        const previousPid = current.pid as number
        pids.add(previousPid)
        await writeFile(resolve(directory, 'nuxt.config.ts'), nuxtConfiguration(2))
        current = await sessionPoll(
            'native Nuxt config soft reload',
            async () => {
                const value = await status()
                return value?.revision === 2 ? value : undefined
            },
            120_000,
        )
        assert.equal(current.pid, previousPid, 'CLI 4 reloads Nuxt configuration in place')
        // CLI 4's native dotenv watcher is the explicit hard-restart trigger.
        await writeFile(resolve(directory, '.env'), 'FILES_CLI_RESTART_MARKER=2\n')
        current = await sessionPoll(
            'native dotenv hard restart replaces serving process',
            async () => {
                const value = await status()
                return value?.revision === 2 && value.pid !== previousPid ? value : undefined
            },
            120_000,
        )
        pids.add(current.pid)
        assertIdentity(current)
        const restarted = await gateway(endpoint, { op: 'list' })
        assert.equal(restarted.status, 200, 'The same public serving URL returns after hard restart')
        assert.deepEqual(
            JSON.parse((await curl()).trim()),
            restarted.body,
            'Native curl lock discovery survives hard restart',
        )
        report = {
            nuxt: versions.nuxt,
            cli: versions.cli,
            disconnectAbort,
            localReferenceUpdated: true,
            aliasLayerRelativeUpdated: true,
            installOnlyRecovery: true,
            npmHiddenMetadataChanged,
            configReload: { kind: 'soft', revision: 2, pidUnchanged: true },
            hardRestart: {
                trigger: 'dotenv-marker',
                revision: 2,
                pidChanged: true,
                urlRetained: true,
                curlDiscovery: true,
            },
        }
        onProgress?.('Native soft reload, real hard restart, same HTTP URL and curl discovery passed')
        await scanConsumer(directory, canaries)
        assert(
            canaries.every((secret) => !JSON.stringify(current).includes(secret) && !log.includes(secret)),
            'Native metadata and CLI logs contain no secret',
        )
    } catch (error) {
        failures.push(String(error))
    } finally {
        clearTimeout(deadlineTimer)
        if (child) {
            try {
                await stop()
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
    clearTimeout(deadlineTimer)
    if (deadline.signal.aborted) failures.push('Packed CLI session exceeded its bounded deadline')
    if (failures.length)
        throw new Error(redact(`${failures.join('\n')}\nLast HTTP failure: ${lastHttpFailure}\nCLI output:\n${log}`))
    assert(report)
    onProgress?.('Owned processes, listener and lock cleaned; archive digest unchanged')
    return report
}
