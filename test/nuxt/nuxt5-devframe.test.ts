import { $fetch, setup, url, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, test } from 'vitest'

import type { FilesDevtoolsSnapshot } from '../../packages/nuxt-files-sdk/src/devtools/snapshot'
import { cleanFixture, fixtureDirectory, installFixture } from '../utils/fixture'

await cleanFixture('nuxt5-nightly')
await installFixture('nuxt5-nightly')

describe('Nuxt DevTools v4 nightly integration', async () => {
    await setup({
        rootDir: fixtureDirectory('nuxt5-nightly'),
        browser: false,
        dev: true,
        server: false,
        build: true,
    })

    test('serves the embedded DevFrame UI and configured registry snapshot', async () => {
        const context = useTestContext()
        const listener = await context.nuxt!.server!.listen(0, { hostname: '127.0.0.1' })
        context.url = listener.url
        ;(context.teardown ??= []).push(() => listener.close())
        const api = await fetch(url('/api/files'))
        expect(api.status, await api.text()).toBe(200)
        const response = await fetch(url('/__nuxt-files-sdk/'))
        const html = await response.text()
        expect(response.status, html).toBe(200)
        expect(html).toContain('<title>Files</title>')
        const script = await fetch(url('/__nuxt-files-sdk/app.js'))
        const javascript = await script.text()
        expect(script.status, javascript).toBe(200)
        expect(javascript).not.toMatch(/from\s*["'](?:devframe|files-sdk)/u)
        const connection = await fetch(url('/__nuxt-files-sdk/__connection.json'))
        expect(connection.status, await connection.text()).toBe(200)
        const snapshot = await $fetch<FilesDevtoolsSnapshot>('/__nuxt-files-sdk/snapshot')
        expect(snapshot.storages).toEqual([
            { adapter: 'fs', plugins: ['versioning'], source: 'storage', initialized: true },
        ])
        expect(snapshot.diagnostics).toEqual([])
    })
})
