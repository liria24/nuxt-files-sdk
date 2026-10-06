import { readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test, vi } from 'vite-plus/test'

import { cleanFixture, fixtureDirectory, installFixture, startFixtureServer } from '../utils/fixture'
import { nuxtLifecycleModule } from '../utils/nuxt-lifecycle'

test('[UPDATE-002] real Nuxt dev rejects old authorization after an invalid edit and recovers after repair', async () => {
    await cleanFixture('nuxt4')
    await installFixture('nuxt4')
    const configPath = resolve(fixtureDirectory('nuxt4'), 'files.config.ts')
    const authorization = resolve(fixtureDirectory('nuxt4'), 'phase-a-authorize.ts')
    const original = await readFile(configPath, 'utf8')
    const nuxtConfigPath = resolve(fixtureDirectory('nuxt4'), 'nuxt.config.ts')
    const originalNuxtConfig = await readFile(nuxtConfigPath, 'utf8')
    let server: Awaited<ReturnType<typeof startFixtureServer>> | undefined
    let lastResponse = ''
    try {
        await writeFile(
            nuxtConfigPath,
            `${originalNuxtConfig.replace('export default', 'const config =')}\nconfig.modules.unshift(${nuxtLifecycleModule})\nexport default config\n`,
        )
        await writeFile(authorization, 'export const authorize = () => ({})')
        await writeFile(
            configPath,
            `import { defineFilesConfig } from 'nuxt-files-sdk/config'
import { authorize } from './phase-a-authorize'
export default defineFilesConfig({ storage: { adapter: 'memory' }, routes: [{ path: '/gateway', authorize, operations: ['list'], secret: 'fixture-secret' }] })`,
        )
        server = await startFixtureServer('nuxt4', { development: true })
        const endpoint = `${server.url}/gateway`
        const status = async () => {
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    signal: AbortSignal.timeout(10_000),
                    headers: { accept: 'application/json', 'content-type': 'application/json' },
                    body: JSON.stringify({ op: 'list' }),
                })
                lastResponse = `HTTP ${response.status}: ${(await response.text()).slice(0, 8000)}`
                return response.status
            } catch (error) {
                lastResponse = String(error)
                return 0
            }
        }
        const diagnostic = () => `${lastResponse}\n${server?.output()}`
        await vi.waitFor(async () => expect(await status(), diagnostic()).toBe(200), {
            timeout: 60_000,
            interval: 250,
        })
        await writeFile(authorization, 'export const authorize = false')
        // Even the old worker must refuse the request, before a restart or compiler error arrives.
        expect(await status(), diagnostic()).toBe(503)
        await new Promise((done) => setTimeout(done, 1000))
        expect(await status(), diagnostic()).not.toBe(200)
        await writeFile(authorization, 'export const authorize = () => ({})')
        await vi.waitFor(async () => expect(await status(), diagnostic()).toBe(200), { timeout: 60_000, interval: 250 })
        await writeFile(authorization, "export const authorize = () => { throw new Error('Denied after update') }")
        await vi.waitFor(async () => expect(await status(), diagnostic()).toBe(500), { timeout: 60_000, interval: 250 })
    } finally {
        await server?.close()
        await writeFile(configPath, original)
        await writeFile(nuxtConfigPath, originalNuxtConfig)
        await rm(authorization, { force: true })
    }
})
