import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from 'vite-plus/test'

import { cleanFixture, fixtureDirectory, runCommand, runFixture, startFixtureServer } from '../utils/fixture'

test('experimental Vite server builds and serves basic Files SSR without Nitro startup or DevTools', async () => {
    await runFixture('nuxt-vite-server')
    const server = await startFixtureServer('nuxt-vite-server')
    try {
        const response = await fetch(server.url)
        expect(response.status).toBe(200)
        expect(await response.text()).toContain('Files SSR: memory')
        expect((await fetch(`${server.url}/__nuxt-files-api/snapshot`)).headers.get('content-type')).toContain(
            'text/html',
        )
    } finally {
        await server.close()
        await cleanFixture('nuxt-vite-server')
    }
})

test('an explicitly configured Gateway fails preparation on a builder without route support', async () => {
    const configPath = resolve(fixtureDirectory('nuxt-vite-server'), 'files.config.ts')
    const original = await readFile(configPath, 'utf8')
    try {
        await writeFile(configPath, "export default { storage: { adapter: 'memory' }, routes: [{ path: '/files' }] }")
        await expect(
            runCommand('bun', ['run', 'prepare'], { cwd: fixtureDirectory('nuxt-vite-server') }),
        ).rejects.toThrow('[nuxt-files-sdk:gateway-unavailable]')
    } finally {
        await writeFile(configPath, original)
    }
})
