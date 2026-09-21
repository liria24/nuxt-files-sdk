import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterAll, describe, expect, test, vi } from 'vitest'

import { defineFilesConfig } from '../../packages/nuxt-files-sdk/src/config'
import {
    optionalAwsSdkDependencies,
    providerCode,
    selectedAdapters,
    setupNitroFilesIntegration,
    type NitroIntegration,
} from '../../packages/nuxt-files-sdk/src/integration/nitro'

const temporaryDirectories: string[] = []
const missingDependency = () => false
afterAll(() => Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true }))))

describe('provider generation', () => {
    test('[CFG-009] selects only providers used in the active runtime mode without resolving credentials', () => {
        expect(() => selectedAdapters(undefined, true)).toThrow(
            '[nuxt-files-sdk:invalid-config] Files configuration must be an object.',
        )
        const runtimeConfig = vi.fn<() => { binding: never }>(() => ({ binding: undefined as never }))
        const config = defineFilesConfig({
            storage: {
                files: { adapter: 'r2', config: runtimeConfig },
                temporary: { adapter: 'memory' },
            },
            devStorage: {
                files: { adapter: 'fs', config: { root: '.data/files' } },
            },
        })

        expect(selectedAdapters(config, false)).toEqual({ adapters: ['memory', 'r2'], single: false })
        expect(selectedAdapters(config, true)).toEqual({ adapters: ['fs', 'memory'], single: false })
        expect(runtimeConfig).not.toHaveBeenCalled()

        const generated = providerCode(['r2'])
        expect(generated.imports).toBe('import { r2 as provider0 } from "files-sdk/r2"')
        expect(generated.factories).toBe('"r2": provider0')
        expect(providerCode(['rustfs']).imports).toBe('import { rustfs as provider0 } from "files-sdk/rustfs"')
    })

    test('[BUNDLE-007] shims only missing optional AWS engines on Nitro v2 workerd presets', () => {
        const expected = [
            '@aws-sdk/client-s3',
            '@aws-sdk/s3-presigned-post',
            '@aws-sdk/s3-request-presigner',
            '@aws-sdk/lib-storage',
        ]
        for (const adapter of ['r2', 'minio', 'rustfs'] as const) {
            expect(
                optionalAwsSdkDependencies([adapter], {
                    nitroMajor: 2,
                    preset: 'cloudflare-module',
                    resolvable: missingDependency,
                }),
            ).toEqual(expected)
        }
        expect(
            optionalAwsSdkDependencies(['s3'], {
                nitroMajor: 2,
                preset: 'cloudflare-pages',
                resolvable: missingDependency,
            }),
        ).toEqual(['@aws-sdk/lib-storage'])
        expect(
            optionalAwsSdkDependencies(['r2', 's3'], {
                nitroMajor: 2,
                preset: 'cloudflare-durable',
                resolvable: missingDependency,
            }),
        ).toEqual(['@aws-sdk/lib-storage'])
        expect(
            optionalAwsSdkDependencies(['r2'], {
                nitroMajor: 3,
                preset: 'cloudflare-module',
                resolvable: missingDependency,
            }),
        ).toEqual([])
        expect(
            optionalAwsSdkDependencies(['r2'], {
                nitroMajor: 2,
                preset: 'node-server',
                resolvable: missingDependency,
            }),
        ).toEqual([])
        expect(
            optionalAwsSdkDependencies(['r2'], {
                nitroMajor: 2,
                preset: 'cloudflare-module',
                resolvable: (dependency) => dependency === '@aws-sdk/client-s3',
            }),
        ).toEqual(expected.slice(1))
    })

    test('[CFG-011] omits development-only storage from production integration', async () => {
        const config = defineFilesConfig({ devStorage: { adapter: 'memory' } })
        expect(selectedAdapters(config, true)).toEqual({ adapters: ['memory'], single: true })
        expect(selectedAdapters(config, false)).toBeUndefined()
        expect(
            selectedAdapters(
                defineFilesConfig({
                    devStorage: {
                        cache: { adapter: 'memory' },
                        uploads: { adapter: 'fs', config: { root: '.data/uploads' } },
                    },
                }),
                true,
            ),
        ).toEqual({ adapters: ['fs', 'memory'], single: false })

        const directory = await mkdtemp(resolve(tmpdir(), 'nuxt-files-sdk-development-only-'))
        temporaryDirectories.push(directory)
        const configPath = resolve(directory, 'files.config.mjs')
        await writeFile(
            configPath,
            `import { defineFilesConfig } from 'nuxt-files-sdk/config'
export default defineFilesConfig({ devStorage: { adapter: 'memory' } })`,
        )
        const hook = vi.fn<NitroIntegration['hooks']['hook']>()
        const nitro: NitroIntegration = {
            options: { rootDir: directory, buildDir: directory, dev: false, plugins: [] },
            hooks: { hook },
        }

        vi.stubEnv('NODE_ENV', 'production')
        try {
            await setupNitroFilesIntegration(nitro, { configPath, development: false })
            const devNitro: NitroIntegration = {
                options: { rootDir: directory, buildDir: directory, dev: true, plugins: [] },
                hooks: { hook: vi.fn<NitroIntegration['hooks']['hook']>() },
            }
            await setupNitroFilesIntegration(devNitro, { configPath, development: true })
            expect(await readFile(devNitro.options.plugins[0]!, 'utf8')).toContain('files-sdk/memory')
        } finally {
            vi.unstubAllEnvs()
        }

        expect(nitro.options.plugins).toEqual([])
        expect(nitro.options.externals).toBeUndefined()
        expect(hook).toHaveBeenCalledOnce()
        const typesPath = resolve(directory, 'nuxt-files-sdk/storage-registry.d.ts')
        const declarations = await readFile(typesPath, 'utf8')
        expect(declarations).toContain('SingleStorage<typeof config>')
        expect(declarations).toContain('StorageRegistry<typeof config>')
        await writeFile(typesPath, 'stale declarations')
        const types = { tsConfig: { include: [] as string[] } }
        await hook.mock.calls[0]![1](types)
        expect(types.tsConfig.include).toContain(typesPath)
        expect(await readFile(typesPath, 'utf8')).toBe(declarations)
    })

    test('[CFG-010] prepare cannot overwrite a running development plugin', async () => {
        const directory = await mkdtemp(resolve(tmpdir(), 'nuxt-files-sdk-generation-'))
        temporaryDirectories.push(directory)
        const configPath = resolve(directory, 'files.config.mjs')
        await writeFile(
            configPath,
            `export default {
  storage: { adapter: 'r2', config: () => { throw new Error('production config resolved') } },
  devStorage: { adapter: 'fs', config: { root: '.data/files' } },
}`,
        )

        const generate = async (development: boolean): Promise<string> => {
            let extendTypes!: (types: object) => void | Promise<void>
            const nitro = {
                options: { rootDir: directory, buildDir: directory, dev: development, plugins: [] },
                hooks: { hook: (_name, callback) => (extendTypes = callback) },
            } as NitroIntegration
            await setupNitroFilesIntegration(nitro, { configPath, development })
            const types = {
                tsConfig: {
                    include: [] as string[],
                    compilerOptions: { paths: {} as Record<string, string[]> },
                },
            }
            await extendTypes(types)
            expect(types.tsConfig.compilerOptions.paths['files-sdk']?.[0]).toMatch(/node_modules\/files-sdk$/u)
            expect(types.tsConfig.compilerOptions.paths['files-sdk']?.[0]).not.toContain('/dist')
            expect(types.tsConfig.compilerOptions.paths['files-sdk/*']).toBeUndefined()
            return nitro.options.plugins[0]!
        }

        const developmentPlugin = await generate(true)
        const developmentSource = await readFile(developmentPlugin, 'utf8')
        const productionPlugin = await generate(false)
        const productionSource = await readFile(productionPlugin, 'utf8')

        expect(productionPlugin).not.toBe(developmentPlugin)
        expect(await readFile(developmentPlugin, 'utf8')).toBe(developmentSource)
        expect(developmentSource).toContain('from "files-sdk/fs"')
        expect(developmentSource).toContain('configureFiles(config,')
        expect(developmentSource).toMatch(/import \{ configureFiles \} from "[^"\n]+\/runtime\/internal\.js"/u)
        expect(developmentSource).not.toContain("from 'nuxt-files-sdk/runtime'")
        expect(productionSource).toContain('from "files-sdk/r2"')
        expect(productionSource).toContain('configureFiles({ storage: config.storage },')
        const environment = JSON.parse(/environment: (.+),/u.exec(productionSource)![1]!) as Record<string, string[][]>
        expect(Object.keys(environment)).toEqual(['r2'])
        expect(environment.r2?.flat()).toContain('R2_ACCESS_KEY_ID')
        expect(environment.r2?.flat()).not.toContain('NUXT_R2_ACCESS_KEY_ID')
        expect(productionSource).not.toContain('files-sdk/providers')
    })
})
