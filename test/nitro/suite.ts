import { readFile, readdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import { fixtureDirectory, readOutput, runCommand, runFixture, startFixtureServer } from '../utils/fixture'

export const nitroSuite = (
    name: 'nitro-v2' | 'nitro-v3',
    hookModule: 'nitropack/types' | 'nitro/types',
    expected: Record<string, unknown>,
): void => {
    describe(`Nitro ${name === 'nitro-v2' ? 'v2' : 'v3'}`, () => {
        test('[NITRO-001][TYPE-006] generates, typechecks, builds, and runs the standalone integration', async () => {
            await runFixture(name, name === 'nitro-v3' ? ['build', 'typecheck'] : undefined)
            const directory = fixtureDirectory(name)
            const generatedDirectory = resolve(
                directory,
                name === 'nitro-v3' ? 'node_modules/.nitro/nuxt-files-sdk' : '.nitro/nuxt-files-sdk',
            )
            const plugin = await readFile(resolve(generatedDirectory, 'plugin.mjs'), 'utf8')
            const types = await readFile(resolve(generatedDirectory, 'storage-registry.d.ts'), 'utf8')

            expect(plugin).toMatch(/import \{ configureFiles \} from "[^"\n]+\/runtime\/internal\.js"/u)
            expect(plugin).not.toContain("from 'nuxt-files-sdk'")
            expect(plugin).toContain('from "files-sdk/fs"')
            expect(plugin).not.toContain('files-sdk/loader')
            expect(types).toContain(`declare module "${hookModule}"`)
            expect(types).toContain("declare module 'nuxt-files-sdk/runtime'")
            expect(plugin).not.toMatch(/import config from "[A-Z]:\\\\/u)

            const server = await startFixtureServer(name)
            try {
                await expect(fetch(`${server.url}/files`).then((response) => response.json())).resolves.toEqual(
                    expected,
                )
            } finally {
                await server.close()
            }
        })

        test('[BUNDLE-008] builds R2, MinIO, and RustFS for workerd without bundling AWS SDK engines', async () => {
            const cloudflare = resolve(fixtureDirectory(name), 'cloudflare')
            await Promise.all(
                ['.nitro', 'node_modules/.nitro', '.output', '.wrangler'].map((entry) =>
                    rm(resolve(cloudflare, entry), { recursive: true, force: true }),
                ),
            )
            await runCommand('bunx', [name === 'nitro-v2' ? 'nitropack' : 'nitro', 'build'], { cwd: cloudflare })

            const generatedDirectory = resolve(
                cloudflare,
                name === 'nitro-v3' ? 'node_modules/.nitro/nuxt-files-sdk' : '.nitro/nuxt-files-sdk',
            )
            const generated = await readOutput(generatedDirectory)
            for (const adapter of ['minio', 'r2', 'rustfs']) {
                expect(generated).toContain(`from "files-sdk/${adapter}"`)
            }
            const generatedFiles = await readdir(generatedDirectory)
            expect(generatedFiles.some((file) => file.includes('aws-sdk-client-s3'))).toBe(name === 'nitro-v2')

            const output = await readOutput(resolve(cloudflare, '.output'))
            expect(output).not.toMatch(/node_modules\/@aws-sdk\//u)

            if (name === 'nitro-v2') {
                const wranglerOutput = resolve(cloudflare, '.wrangler-dry-run')
                await rm(wranglerOutput, { recursive: true, force: true })
                try {
                    await runCommand(
                        'bunx',
                        [
                            'wrangler',
                            'deploy',
                            '.output/server/index.mjs',
                            '--name',
                            'nuxt-files-sdk-nitro-v2-fixture',
                            '--dry-run',
                            '--outdir',
                            wranglerOutput,
                            '--compatibility-date',
                            '2026-09-04',
                        ],
                        { cwd: cloudflare },
                    )
                } finally {
                    await rm(wranglerOutput, { recursive: true, force: true })
                }
            }
        })
    })
}
