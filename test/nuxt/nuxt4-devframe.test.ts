import { $fetch, setup, url, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, test } from 'vitest'

import type { FilesDevtoolsSnapshot } from '../../packages/nuxt-files-sdk/src/devtools/snapshot'
import { cleanFixture, fixtureDirectory, installFixture } from '../utils/fixture'

await cleanFixture('nuxt4')
await installFixture('nuxt4')

describe('Nuxt DevFrame development endpoint', async () => {
    await setup({
        rootDir: fixtureDirectory('nuxt4'),
        browser: false,
        dev: true,
        server: false,
        build: true,
        nuxtConfig: { devtools: { enabled: true } },
    })

    test('[DEV-004] serves the shared UI and a real configured registry snapshot', async () => {
        // Use the prepared Nuxt instance so the same server receives test overrides.
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
        const snapshot = await $fetch<FilesDevtoolsSnapshot>('/__nuxt-files-sdk/snapshot')
        expect(snapshot.storages).toEqual([
            { name: 'archive', adapter: 'fs', plugins: ['versioning'], source: 'storage', initialized: true },
            { name: 'blob', adapter: 'fs', plugins: ['versioning'], source: 'storage', initialized: true },
        ])
        expect(snapshot.diagnostics).toEqual([])
    })
})
