import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test, vi } from 'vite-plus/test'

import { fixtureDirectory, installFixture, runCommand, startFixtureServer } from './fixture'

export const unconfiguredSuite = (name: 'nuxt4' | 'nitro-v2' | 'nitro-v3', contract: string): void => {
    test(`[${contract}] unconfigured prepare, build and development recover when storage changes`, async () => {
        await installFixture(name)
        const fixture = fixtureDirectory(name)
        const parent = resolve(fixture, '.contract-unconfigured')
        await mkdir(parent, { recursive: true })
        const directory = await mkdtemp(resolve(parent, 'app-'))
        const nuxt = name === 'nuxt4'
        const framework = nuxt ? 'nuxt' : name === 'nitro-v2' ? 'nitropack' : 'nitro'
        const manifest = JSON.parse(
            await readFile(resolve(fixture, 'node_modules', framework, 'package.json'), 'utf8'),
        ) as { bin: Record<string, string> }
        const bin = resolve(fixture, 'node_modules', framework, manifest.bin[framework]!)
        const configPath = resolve(directory, 'files.config.ts')
        const routes = resolve(directory, nuxt ? 'server/api' : 'routes')
        const endpoint = nuxt ? '/api/health' : '/health'
        let server: Awaited<ReturnType<typeof startFixtureServer>> | undefined
        const run = (command: string) => runCommand('node', [bin, command], { cwd: directory })
        const configured = `export default { storage: { adapter: 'memory' }, routes: [{ path: '/api/gateway', operations: ['list'] }] }`
        try {
            await writeFile(resolve(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
            if (nuxt)
                await writeFile(
                    resolve(directory, 'tsconfig.json'),
                    JSON.stringify({ extends: './.nuxt/tsconfig.json' }),
                )
            await writeFile(
                resolve(directory, nuxt ? 'nuxt.config.ts' : 'nitro.config.ts'),
                `export default {
                modules: ['nuxt-files-sdk${nuxt ? '' : '/nitro'}'],
                ${nuxt ? 'devtools: { enabled: false }, experimental: { nitroAutoImports: true }, nitro: { minify: true },' : "minify: true, serverDir: './',"}
            }`,
            )
            const fallback = resolve(directory, nuxt ? 'server/api' : 'routes/api')
            await mkdir(fallback, { recursive: true })
            await writeFile(
                resolve(fallback, '[...path].ts'),
                `export default () => new Response('Not found', { status: 404 })`,
            )
            await mkdir(routes, { recursive: true })
            await writeFile(
                resolve(routes, 'health.ts'),
                `import { useServerFiles as explicit } from 'nuxt-files-sdk/runtime'
                export default () => {
                    try { ${nuxt ? 'useServerFiles' : 'explicit'}(); return { configured: true, explicit: explicit() === ${nuxt ? 'useServerFiles' : 'explicit'}() } }
                    catch (error) { return { configured: false, message: error instanceof Error ? error.message : String(error) } }
                }`,
            )
            for (const source of [
                undefined,
                '// configure later',
                'export default {}',
                nuxt ? 'export default defineFilesConfig({ storage: null })' : 'export default { storage: null }',
            ]) {
                if (source !== undefined) await writeFile(configPath, source)
                const output = await run(name === 'nitro-v3' ? 'build' : 'prepare')
                expect(output).toContain('No storage is configured')
            }
            if (nuxt) await run('typecheck')
            expect(await run('build')).toContain('No storage is configured')
            server = await startFixtureServer(name, { directory, readyPath: endpoint })
            await expect(fetch(`${server.url}${endpoint}`).then((response) => response.json())).resolves.toMatchObject({
                configured: false,
                message: expect.stringContaining('[nuxt-files-sdk:not-configured]'),
            })
            const missingGateway = await fetch(`${server.url}/api/gateway`)
            expect(missingGateway.status, `${await missingGateway.text()}\n${server.output()}`).toBe(404)
            await server.close()
            server = undefined
            await rm(configPath)
            server = await startFixtureServer(name, {
                directory,
                readyPath: endpoint,
                development: true,
                developmentCommand: [bin, 'dev', ...(nuxt ? ['--no-fork'] : [])],
            })
            const development = server
            const state = () =>
                fetch(`${development.url}${endpoint}`, { signal: AbortSignal.timeout(5000) }).then((response) =>
                    response.json(),
                )
            expect(await state()).toMatchObject({ configured: false })
            for (let iteration = 0; iteration < 2; iteration++) {
                await writeFile(configPath, configured)
                await vi.waitFor(
                    async () => expect(await state()).toMatchObject({ configured: true, explicit: true }),
                    { timeout: 60_000, interval: 500 },
                )
                expect((await fetch(`${development.url}/api/gateway`)).status).not.toBe(404)
                await rm(configPath)
                await vi.waitFor(
                    async () => {
                        expect(await state()).toMatchObject({ configured: false })
                        expect((await fetch(`${development.url}/api/gateway`)).status).toBe(404)
                    },
                    { timeout: 60_000, interval: 500 },
                )
            }
            expect(development.output()).not.toContain('ENOENT')
            expect(development.output().match(/No storage is configured/gu)).toHaveLength(3)
        } finally {
            await server?.close()
            await rm(directory, { recursive: true, force: true })
        }
    }, 300_000)
}
