import { readFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FilesConfig } from '../config'
import { registerSdkAliases, resolveOwnedSdk } from '../integration/resolve'
import { normalizeFilesConfig } from '../runtime/normalize'
import { mergeFilesConfig } from './merge'

export interface FilesConfigLoaderOptions {
    configPath: string
    environments: readonly string[]
    alias?: Record<string, string> | undefined
    injectImports?: ((code: string, id?: string) => Promise<{ code: string }>) | undefined
    source?: string
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)

const hasEnvironmentStorage = (config: Record<string, unknown>): boolean =>
    [
        config.$development,
        config.$production,
        config.$test,
        config.$prerender,
        ...(isObject(config.$env) ? Object.values(config.$env) : []),
    ].some((branch) => isObject(branch) && branch.storage !== undefined)

export const loadFilesConfig = async ({
    configPath,
    environments,
    alias,
    injectImports,
    source,
}: FilesConfigLoaderOptions): Promise<FilesConfig | undefined> => {
    const { loadConfig } = await import('c12')
    const { createJiti } = await import('jiti')
    const jiti = createJiti(import.meta.url, {
        alias: {
            ...registerSdkAliases(alias ?? {}, resolveOwnedSdk()),
            'nuxt-files-sdk/config': fileURLToPath(new URL('../config.js', import.meta.url)),
        },
        interopDefault: true,
        moduleCache: false,
    })
    const { config, layers } = await loadConfig<Record<string, unknown>>({
        cwd: dirname(configPath),
        configFile: basename(configPath),
        configFileRequired: true,
        rcFile: false,
        extend: false,
        dotenv: false,
        envName: [...environments],
        omit$Keys: true,
        merger: mergeFilesConfig,
        envMerger: mergeFilesConfig,
        import: async (id) => {
            const input = source ?? (await readFile(id, 'utf8'))
            const code = injectImports ? (await injectImports(input, id)).code : input
            return jiti.evalModule(code, { filename: id, async: true })
        },
    })
    if (config.storage === undefined && layers?.some(({ config }) => config && hasEnvironmentStorage(config)))
        return undefined
    normalizeFilesConfig(config)
    // Storage is validated above; route validation follows during preparation.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return config as unknown as FilesConfig
}
