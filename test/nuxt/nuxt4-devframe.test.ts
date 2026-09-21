import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { $fetch, setup, url, useTestContext } from '@nuxt/test-utils/e2e'
import { createFilesClient } from 'files-sdk/client'
import { afterAll, describe, expect, test, vi } from 'vitest'

import type { FilesDevtoolsSnapshot } from '../../packages/nuxt-files-sdk/src/devtools/snapshot'
import { cleanFixture, fixtureDirectory, installFixture } from '../utils/fixture'

await cleanFixture('nuxt4')
await installFixture('nuxt4')
const authHome = await mkdtemp(resolve(tmpdir(), 'nuxt-files-auth-'))
await mkdir(resolve(authHome, '.nuxt/devtools'), { recursive: true })
await writeFile(resolve(authHome, '.nuxt/devtools/dev-auth-token.txt'), 'fixture-native-token')
vi.stubEnv('XDG_CONFIG_HOME', authHome)
// Exercise native DevTools, which otherwise skips setup under test runners.
vi.stubEnv('VITEST', undefined)
vi.stubEnv('TEST', undefined)
vi.stubEnv('NODE_ENV', 'development')
afterAll(async () => {
    vi.unstubAllEnvs()
    await rm(authHome, { recursive: true, force: true })
})

describe('Nuxt DevFrame development endpoint', async () => {
    await setup({
        runner: 'vitest',
        rootDir: fixtureDirectory('nuxt4'),
        browser: false,
        dev: true,
        server: false,
        build: true,
        nuxtConfig: { modules: ['@nuxt/devtools'], devtools: { enabled: true } },
    })

    let authorization = ''

    test('[DEV-004] registers the Files tab and serves the shared UI with a real registry snapshot', async () => {
        // Use the prepared Nuxt instance so the same server receives test overrides.
        const context = useTestContext()
        const tabs: Array<{ name?: string; view?: unknown }> = []
        await context.nuxt!.callHook('devtools:customTabs', tabs as never)
        const filesTabs = tabs.filter(({ name }) => name === 'nuxt-files-sdk') as Array<{
            name: string
            view: { type: 'iframe'; src: string }
        }>
        expect(filesTabs).toEqual([
            expect.objectContaining({
                name: 'nuxt-files-sdk',
                view: { type: 'iframe', src: '/__nuxt-files-sdk/?host=nuxt-v3' },
            }),
        ])
        const listener = await context.nuxt!.server!.listen(0, { hostname: '127.0.0.1' })
        context.url = listener.url
        ;(context.teardown ??= []).push(() => listener.close())
        const api = await fetch(url('/api/files'))
        expect(api.status, await api.text()).toBe(200)
        const response = await fetch(url(filesTabs[0]!.view.src))
        const html = await response.text()
        expect(response.status, html).toBe(200)
        expect(html).toContain('<title>Files</title>')
        expect(html).toContain('File browser')
        expect(html).toContain('src="./app.js"')
        expect(html).toContain('id="access-badge" class="access-badge" hidden')
        expect(html).toContain('id="storage-select" aria-label="Storage" hidden')
        const script = await fetch(url('/__nuxt-files-sdk/app.js'))
        const javascript = await script.text()
        expect(script.status, javascript).toBe(200)
        expect(script.headers.get('content-type')).toContain('javascript')
        expect(javascript.length).toBeGreaterThan(10_000)
        expect(javascript).not.toMatch(/from\s*["'](?:devframe|files-sdk)/u)
        const unauthorized = await fetch(url('/__nuxt-files-sdk/snapshot'))
        expect(unauthorized.status).toBe(401)
        for (const headers of [{}, { 'x-nuxt-files-sdk-bootstrap': 'nuxt-v3' }, { 'x-nuxt-devtools-token': 'wrong' }]) {
            expect((await fetch(url('/__nuxt-files-sdk/token'), { headers })).status).toBe(401)
        }
        const host = (context.nuxt as unknown as { devtools: { ensureDevAuthToken(token: string): Promise<void> } })
            .devtools
        await expect(host.ensureDevAuthToken('fixture-native-token')).resolves.toBeUndefined()
        const tokenResponse = await fetch(url('/__nuxt-files-sdk/token'), {
            headers: { 'x-nuxt-devtools-token': 'fixture-native-token' },
        })
        expect(tokenResponse.status, await tokenResponse.clone().text()).toBe(200)
        const token = (await tokenResponse.json()) as { token: string }
        authorization = `Bearer ${token.token}`
        const snapshot = await $fetch<FilesDevtoolsSnapshot>('/__nuxt-files-sdk/snapshot', {
            headers: { authorization },
        })
        expect(snapshot.storages).toEqual([
            { name: 'archive', adapter: 'fs', plugins: ['versioning'], source: 'storage', initialized: true },
            { name: 'blob', adapter: 'fs', plugins: [], source: 'devStorage', initialized: true },
        ])
        expect(snapshot.diagnostics).toEqual([])
    })

    test('[DEV-005] browses, uploads, downloads, and deletes through the native Files gateway', async () => {
        const endpoint = url('/__nuxt-files-sdk/files?storage=blob')
        const origin = new URL(endpoint).origin
        const access = await fetch(`${endpoint}&op=devtools`, { headers: { authorization } }).then(
            (response) => response.json() as Promise<{ write: boolean; maxUploadSize: number }>,
        )
        expect(access).toEqual({ write: true, maxUploadSize: 10 * 1024 * 1024 })

        const files = createFilesClient({ endpoint, headers: { authorization, origin } })
        await files.upload('docs/hello.txt', 'hello devtools', { contentType: 'text/plain' })
        expect(await files.exists('docs/hello.txt')).toBe(true)
        const root = await files.list({ delimiter: '/' })
        expect(root.prefixes).toContain('docs/')
        const listed = await files.list({ prefix: 'docs/', delimiter: '/' })
        expect(listed.items).toEqual([expect.objectContaining({ key: 'docs/hello.txt', size: 14, type: 'text/plain' })])
        expect(await (await files.download('docs/hello.txt')).text()).toBe('hello devtools')
        await files.delete('docs/hello.txt')
        expect(await files.exists('docs/hello.txt')).toBe(false)
    })
})
