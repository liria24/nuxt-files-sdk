import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { expect, test, vi, type TestContext } from 'vite-plus/test'

import { withConsumerSession } from '../utils/consumer-session'
import { closeOwnedProcess, runCommand, startFixtureServer } from '../utils/fixture'
import { checkHoverDocumentation } from '../utils/generated-types'

const alive = (pid: number) => {
    try {
        process.kill(pid, 0)
        return true
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
        throw error
    }
}

test('[CLI-004] cancelled consumer drains its owned tree before removal and never starts the next stage', async (testContext) => {
    const directory = await mkdtemp(resolve(tmpdir(), 'files-consumer-cancellation-'))
    const report = resolve(directory, 'owned.json')
    const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
    const controller = new AbortController()
    const onTestFinished = vi.fn<TestContext['onTestFinished']>()
    const next = vi.fn<() => Promise<void>>()
    const context = { ...testContext, signal: controller.signal, onTestFinished }
    const source = `const { spawn } = require('node:child_process'); const fs = require('node:fs');
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
fs.writeFileSync(process.env.FILES_TEST_REPORT, JSON.stringify([process.pid, child.pid]));
process.on('SIGTERM', () => { child.once('exit', () => process.exit(0)); child.kill('SIGTERM'); });
setInterval(() => {}, 1000);`
    const work = withConsumerSession(context, 'cancellation regression', async ({ signal, stage }) => {
        await stage('owned command', () =>
            runCommand(process.execPath, ['-e', source], {
                cwd: directory,
                env: { FILES_TEST_REPORT: report },
                signal,
            }),
        )
        await stage('next operation', next)
    })
    // Observe rejection immediately, while the test waits for the owned tree to become ready.
    const outcome = work.then(
        () => undefined,
        (error: unknown) => error,
    )
    try {
        let pids: number[] | undefined
        for (let attempt = 0; attempt < 100; attempt++) {
            try {
                pids = JSON.parse(await readFile(report, 'utf8')) as number[]
                break
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
            }
            await new Promise((done) => setTimeout(done, 20))
        }
        expect(pids).toHaveLength(2)
        controller.abort(new Error('fixture deadline'))
        expect(String(await outcome)).toContain('cancelled')
        for (const [drain] of onTestFinished.mock.calls) await expect(drain(context)).rejects.toThrow('cancelled')
        expect(pids!.map(alive)).toEqual([false, false])
        expect(alive(unrelated.pid!)).toBe(true)
        expect(next).not.toHaveBeenCalled()
        await rm(directory, { recursive: true, force: true })
    } finally {
        controller.abort()
        await outcome
        await closeOwnedProcess(unrelated)
        await rm(directory, { recursive: true, force: true })
    }
})

test('[CLI-004] cancellation during server readiness closes the owned process before removal', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'files-server-cancellation-'))
    const report = resolve(directory, 'server.pid')
    const output = resolve(directory, '.output/server')
    await mkdir(output, { recursive: true })
    await writeFile(
        resolve(output, 'index.mjs'),
        `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(report)}, String(process.pid)); setInterval(() => {}, 1000)`,
    )
    const controller = new AbortController()
    const work = startFixtureServer(directory, { signal: controller.signal })
    const outcome = work.then(
        () => undefined,
        (error: unknown) => error,
    )
    let pid: number | undefined
    try {
        for (let attempt = 0; attempt < 100; attempt++) {
            try {
                pid = Number(await readFile(report, 'utf8'))
                break
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
            }
            await new Promise((done) => setTimeout(done, 20))
        }
        expect(pid).toBeGreaterThan(0)
        controller.abort(new Error('readiness deadline'))
        expect(String(await outcome)).toContain('readiness deadline')
        expect(alive(pid!)).toBe(false)
        await rm(directory, { recursive: true, force: true })
    } finally {
        controller.abort()
        await outcome
        await rm(directory, { recursive: true, force: true })
    }
})

test('[CLI-004] cancelled LSP request closes its witnessed owned process before removal', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'files-hover-cancellation-'))
    const controller = new AbortController()
    let owned: ReturnType<typeof spawn> | undefined
    let observedAlive = false
    const work = checkHoverDocumentation(directory, {
        signal: controller.signal,
        onStart(child) {
            owned = child
            child.once('spawn', () => {
                observedAlive = alive(child.pid!)
                controller.abort(new Error('hover deadline'))
            })
        },
    })
    try {
        await expect(work).rejects.toThrow('hover deadline')
        expect(owned?.pid).toBeGreaterThan(0)
        expect(observedAlive).toBe(true)
        expect(alive(owned!.pid!)).toBe(false)
        expect(owned!.exitCode !== null || owned!.signalCode !== null).toBe(true)
        await rm(directory, { recursive: true, force: true })
    } finally {
        controller.abort()
        await work.catch(() => {})
        await rm(directory, { recursive: true, force: true })
    }
})

test('[CLI-004] resource handoff retains its finally and the drain awaits delayed cleanup', async (testContext) => {
    const controller = new AbortController()
    const onTestFinished = vi.fn<TestContext['onTestFinished']>()
    const context = { ...testContext, signal: controller.signal, onTestFinished }
    const release = Promise.withResolvers<void>()
    const next = vi.fn<() => Promise<void>>()
    let closing = false
    let closed = false
    const work = withConsumerSession(context, 'resource handoff', async ({ stage }) => {
        const resource = await stage('create resource', async () => {
            controller.abort(new Error('handoff deadline'))
            return {
                async close() {
                    closing = true
                    await release.promise
                    closed = true
                },
            }
        })
        try {
            await stage('next operation', next)
        } finally {
            await stage('resource shutdown', () => resource.close(), true)
        }
    })
    const outcome = work.catch((error: unknown) => error)
    let drained = false
    const drain = Promise.resolve(onTestFinished.mock.calls[0]![0](context)).finally(() => {
        drained = true
    })
    const drainOutcome = drain.catch((error: unknown) => error)
    try {
        await new Promise((done) => setImmediate(done))
        expect(closing).toBe(true)
        expect(closed).toBe(false)
        expect(drained).toBe(false)
        expect(next).not.toHaveBeenCalled()
        release.resolve()
        expect(String(await drainOutcome)).toContain('handoff deadline')
        expect(String(await outcome)).toContain('handoff deadline')
        expect(closed).toBe(true)
        expect(drained).toBe(true)
    } finally {
        release.resolve()
        await outcome
        await drainOutcome
    }
})
