import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterAll, describe, expect, test, vi } from 'vitest'

import { defineFilesConfig } from '../../packages/nuxt-files-sdk/src/config'
import {
    providerCode,
    selectedAdapters,
    setupNitroFilesIntegration,
    type NitroIntegration,
} from '../../packages/nuxt-files-sdk/src/integration/nitro'

const temporaryDirectories: string[] = []
afterAll(() => Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true }))))

describe('provider generation', () => {
    test('[CFG-009] selects only providers used in the active runtime mode without resolving credentials', () => {
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
            await extendTypes({})
            return nitro.options.plugins[0]!
        }

        const developmentPlugin = await generate(true)
        const developmentSource = await readFile(developmentPlugin, 'utf8')
        const productionPlugin = await generate(false)

        expect(productionPlugin).not.toBe(developmentPlugin)
        expect(await readFile(developmentPlugin, 'utf8')).toBe(developmentSource)
        expect(developmentSource).toContain('from "files-sdk/fs"')
        expect(await readFile(productionPlugin, 'utf8')).toContain('from "files-sdk/r2"')
    })
})
