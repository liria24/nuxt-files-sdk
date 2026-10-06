import { expect, test, vi } from 'vite-plus/test'

import { cleanFixture, installFixture, startFixtureServer } from '../utils/fixture'

// The distributed Nuxt 5 builder is exercised through its real CLI, rather than Nuxt 4's legacy listen API.
test('experimental Nuxt 5 serves its embedded DevFrame UI and authenticated snapshot route', async () => {
    await cleanFixture('nuxt5-nightly')
    await installFixture('nuxt5-nightly')
    vi.stubEnv('VITEST', undefined)
    vi.stubEnv('TEST', undefined)
    vi.stubEnv('NODE_ENV', 'development')
    const server = await startFixtureServer('nuxt5-nightly', { development: true, readyPath: '/__nuxt-files-sdk/' })
    try {
        const response = await fetch(`${server.url}/__nuxt-files-sdk/`)
        const html = await response.text()
        expect(response.status, html).toBe(200)
        expect(html, server.output()).toContain('<title>Files</title>')
        const script = await fetch(`${server.url}/__nuxt-files-sdk/app.js`)
        expect(script.status).toBe(200)
        const client = await script.text()
        expect(client).not.toMatch(/from\s*["'](?:devframe|files-sdk)/u)
        for (const path of ['/__nuxt-files-api/token', '/__nuxt-files-api/snapshot', '/__nuxt-files-api/files']) {
            expect(client).toContain(path)
        }
        expect((await fetch(`${server.url}/__nuxt-files-api/snapshot`)).status).toBe(401)
        const api = await fetch(`${server.url}/api/files`)
        expect(api.status, await api.text()).toBe(200)
    } finally {
        await server.close()
        await cleanFixture('nuxt5-nightly')
        vi.unstubAllEnvs()
    }
})
