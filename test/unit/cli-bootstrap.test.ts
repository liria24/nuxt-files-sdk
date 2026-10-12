import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { expect, test } from 'vite-plus/test'

import { closeOwnedProcess } from '../utils/fixture'
import { nuxtCliBootstrap } from '../utils/packed-cli-session'

const delay = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))
const nativeWorker = `import { createServer } from 'node:net'
import { writeFileSync } from 'node:fs'
const server = createServer()
server.listen(0, '127.0.0.1', () => process.send({ phase: 'ready', pid: process.pid }))
process.on('message', message => {
  if (message !== 'native-close') return
  setTimeout(() => server.close(() => {
    writeFileSync(process.argv[2], 'native close hooks completed')
    process.exit(0)
  }), 150)
})
`
const nativeSupervisor = `import { spawn } from 'node:child_process'
const worker = spawn(process.execPath, [process.argv[2], process.argv[3]], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
worker.on('message', message => process.send(message))
worker.on('close', (code, signal) => {
  process.send({ phase: 'native-closed', code, signal })
  setTimeout(() => process.send({ phase: 'native-idle', resources: process.getActiveResourcesInfo() }), 100).unref()
})
process.on('SIGTERM', () => {
  process.send({ phase: 'stop-started' })
  if (process.argv[4] !== 'busy') worker.send('native-close')
})
process.on('message', message => {
  if (message === 'release-native') worker.send('native-close')
})
`

const session = async (busy = false) => {
    const directory = await mkdtemp(resolve(tmpdir(), 'files-cli-bootstrap-'))
    const bootstrap = resolve(directory, 'bootstrap.mjs')
    const native = resolve(directory, 'native.mjs')
    const worker = resolve(directory, 'worker.mjs')
    const marker = resolve(directory, 'closed.txt')
    await Promise.all([
        writeFile(bootstrap, nuxtCliBootstrap),
        writeFile(native, nativeSupervisor),
        writeFile(worker, nativeWorker),
    ])
    const child = spawn(process.execPath, [bootstrap, native, worker, marker, busy ? 'busy' : 'idle'], {
        cwd: directory,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    })
    const messages: Record<string, unknown>[] = []
    let output = ''
    child.stderr!.on('data', (chunk) => (output += chunk))
    child.on('message', (message) => messages.push(message as Record<string, unknown>))
    const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done) => {
        child.once('exit', (code, signal) => done({ code, signal }))
    })
    const phase = async (name: string) => {
        for (let attempt = 0; attempt < 1500; attempt++) {
            const message = messages.find((entry) => entry.phase === name)
            if (message) return message
            if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Bootstrap exited: ${output}`)
            await delay(20)
        }
        throw new Error(`Bootstrap phase ${name} timed out: ${output}`)
    }
    return { child, directory, marker, phase, exit, messages, output: () => output }
}

test('[CLI-005] completed native teardown exits the bootstrap without retaining its control IPC', async () => {
    const owned = await session()
    const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
    try {
        const worker = await owned.phase('ready')
        owned.child.send('unrelated-control-message')
        await delay(100)
        expect(owned.messages.some((message) => message.phase === 'stop-started')).toBe(false)
        const cleanup = closeOwnedProcess(owned.child, {
            cwd: owned.directory,
            reported: new Set([worker.pid as number]),
            ipcMessage: 'files-cli-stop',
        }).then(
            () => ({ ok: true as const }),
            (error: unknown) => ({ ok: false as const, error }),
        )
        const closed = await owned.phase('native-closed')
        const outcome = await cleanup
        if (!outcome.ok)
            throw new Error(
                `${String(outcome.error)}\nNative worker: ${JSON.stringify(closed)}\nResources: ${JSON.stringify(owned.messages)}\n${owned.output()}`,
            )
        expect(await owned.exit).toEqual({ code: 0, signal: null })
        expect(await readFile(owned.marker, 'utf8')).toBe('native close hooks completed')
        expect(closed).toMatchObject({
            code: 0,
            signal: null,
        })
        expect(owned.output()).toContain('"phase":"exit","code":0')
        expect(process.kill(unrelated.pid!, 0)).toBe(true)
    } finally {
        await closeOwnedProcess(owned.child, { cwd: owned.directory })
        await closeOwnedProcess(unrelated)
        await rm(owned.directory, { recursive: true, force: true })
    }
})

test('[CLI-005] control IPC release keeps a busy native worker and root alive until actual teardown', async () => {
    const owned = await session(true)
    let closing: Promise<void> | undefined
    try {
        const worker = await owned.phase('ready')
        closing = closeOwnedProcess(owned.child, {
            cwd: owned.directory,
            reported: new Set([worker.pid as number]),
            ipcMessage: 'files-cli-stop',
        })
        void closing.catch(() => {})
        await owned.phase('stop-started')
        await delay(250)
        expect(owned.child.exitCode).toBeNull()
        expect(owned.child.signalCode).toBeNull()
        expect(process.kill(owned.child.pid!, 0)).toBe(true)
        expect(process.kill(worker.pid as number, 0)).toBe(true)
        owned.child.send('release-native')
        await closing
        expect(await owned.exit).toEqual({ code: 0, signal: null })
        expect(await readFile(owned.marker, 'utf8')).toBe('native close hooks completed')
    } finally {
        if (owned.child.connected) owned.child.send('release-native')
        await closing?.catch(() => {})
        await closeOwnedProcess(owned.child, { cwd: owned.directory })
        await rm(owned.directory, { recursive: true, force: true })
    }
})
