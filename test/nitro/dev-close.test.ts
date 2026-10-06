import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { expect, test } from 'vite-plus/test'

import { resolvePackage } from '../../packages/nuxt-files-sdk/src/integration/resolve'
import { fixtureDirectory, installFixture, repositoryRoot, runCommand } from '../utils/fixture'

test('[UPDATE-003] native Nitro workers cannot reconnect IPC after the development close guard', async () => {
    await installFixture('nitro-v2')
    const native = resolvePackage('nitropack', pathToFileURL(resolve(fixtureDirectory('nitro-v2'), 'package.json')))
    if (native.status !== 'resolved') throw new Error('The fixture-owned native Nitro entry could not be resolved.')
    const entry = pathToFileURL(native.entry).href
    const guard = pathToFileURL(
        resolve(repositoryRoot, 'packages/nuxt-files-sdk/dist/integration/nitro-dev-close.js'),
    ).href
    const directory = await mkdtemp(resolve(tmpdir(), 'files-nitro-close-'))
    const script = resolve(directory, 'repro.mjs')
    const source = String.raw`
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
const { createNitro, createDevServer } = await import(process.argv[2])
const { stopNitroDevReloadOnClose } = await import(process.argv[3])
const sockets = new Set()
const resources = []
let connections = 0
let total = 0
const ipc = createServer(socket => {
    sockets.add(socket); connections++; total++
    socket.on('error', () => {})
    socket.on('close', () => { sockets.delete(socket); connections-- })
})
const waitFor = async predicate => {
    const deadline = Date.now() + 5000
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error('Native worker IPC deadline exceeded')
        await new Promise(done => setTimeout(done, 20))
    }
}
try {
    await new Promise((done, fail) => { ipc.once('error', fail); ipc.listen(0, '127.0.0.1', done) })
    const port = ipc.address().port
    for (const guarded of [false, true]) {
        const root = resolve(process.cwd(), String(guarded))
        const output = resolve(root, 'server')
        await mkdir(output, { recursive: true })
        await writeFile(resolve(output, 'index.mjs'), [
            "import { createConnection } from 'node:net'",
            "import { parentPort } from 'node:worker_threads'",
            'const socket = createConnection({host:"127.0.0.1",port:' + port + '})',
            "socket.on('error', () => {})",
            "parentPort.on('message', message => { if(message.event === 'shutdown') socket.end(() => parentPort.postMessage({event:'exit'})) })",
        ].join('\n'))
        const nitro = await createNitro({
            rootDir: root, dev: true, preset: 'node-server', compatibilityDate: '2026-10-06',
            output: { dir: root, serverDir: output }, devServer: { watch: [] },
        })
        if (guarded) stopNitroDevReloadOnClose(nitro)
        const server = createDevServer(nitro)
        resources.push({ nitro, server })
        const before = total
        await nitro.hooks.callHook('dev:reload')
        await waitFor(() => connections === 1)
        await nitro.close()
        await waitFor(() => connections === 0)
        await nitro.hooks.callHook('dev:reload')
        if (!guarded) await waitFor(() => connections === 1)
        else {
            await new Promise(done => setTimeout(done, 1000))
            assert.equal(connections, 0)
            assert.equal(total, before + 1)
        }
        await server.close()
        await waitFor(() => connections === 0)
    }
} finally {
    for (const resource of resources.reverse()) { await resource.server.close(); await resource.nitro.close() }
    for (const socket of sockets) socket.destroy()
    if (ipc.listening) await new Promise(done => ipc.close(done))
}
assert.equal(sockets.size, 0)
console.log('Native late reload reproduced; guarded workers and IPC clean.')
`
    try {
        await writeFile(script, source)
        const output = await runCommand('node', [script, entry, guard], {
            cwd: directory,
            env: { NITRO_NO_UNIX_SOCKET: '1' },
            timeout: 30_000,
        })
        expect(output).toContain('Native late reload reproduced; guarded workers and IPC clean.')
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})
