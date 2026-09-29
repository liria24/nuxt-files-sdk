import { readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test, vi } from 'vitest'

import { cleanFixture, fixtureDirectory, installFixture, startFixtureServer } from '../utils/fixture'
import { postGateway } from '../utils/gateway'

test('[UPDATE-002] real Nuxt dev rejects old authorization after an invalid edit and recovers after repair', async () => {
    await cleanFixture('nuxt4')
    await installFixture('nuxt4')
    const configPath = resolve(fixtureDirectory('nuxt4'), 'files.config.ts')
    const authorization = resolve(fixtureDirectory('nuxt4'), 'phase-a-authorize.ts')
    const original = await readFile(configPath, 'utf8')
    let server: Awaited<ReturnType<typeof startFixtureServer>> | undefined
    try {
        await writeFile(authorization, 'export const authorize = () => ({})')
        await writeFile(
            configPath,
            `import { defineFilesConfig } from 'nuxt-files-sdk/config'
import { authorize } from './phase-a-authorize'
export default defineFilesConfig({ storage: { adapter: 'memory' }, routes: [{ path: '/gateway', authorize, operations: ['list'], secret: 'fixture-secret' }] })`,
        )
        server = await startFixtureServer('nuxt4', { development: true })
        const endpoint = `${server.url}/gateway`
        const status = () =>
            postGateway(endpoint, { op: 'list' })
                .then((response) => response.status)
                .catch(() => 0)
        await vi.waitFor(async () => expect(await status(), server?.output()).toBe(200), {
            timeout: 60_000,
            interval: 250,
        })
        await writeFile(authorization, 'export const authorize = false')
        // Even the old worker must refuse the request, before a restart or compiler error arrives.
        expect(await status()).toBe(503)
        await new Promise((done) => setTimeout(done, 1000))
        expect(await status()).not.toBe(200)
        await writeFile(authorization, 'export const authorize = () => ({})')
        await vi.waitFor(async () => expect(await status()).toBe(200), { timeout: 60_000, interval: 250 })
        await writeFile(authorization, "export const authorize = () => { throw new Error('Denied after update') }")
        await vi.waitFor(async () => expect(await status()).toBe(500), { timeout: 60_000, interval: 250 })
    } finally {
        await server?.close()
        await writeFile(configPath, original)
        await rm(authorization, { force: true })
    }
})
