import { readFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FilesConfig } from '../config'
import { registerSdkAliases, resolveOwnedSdk } from '../integration/resolve'
import { normalizeFilesConfig } from '../runtime/normalize'
import { createFilesConfigEvaluator } from './evaluate'
import { mergeFilesConfig } from './merge'

export interface FilesConfigLoaderOptions {
    configPath: string
    environments: readonly string[]
    alias?: Record<string, string> | undefined
    injectImports?: ((code: string, id?: string) => Promise<{ code: string }>) | undefined
    source?: string
    onSource?: ((filename: string) => void) | undefined
    onUnconfigured?: (() => void) | undefined
}

/** Only a missing entry file is optional; imported files and other I/O failures remain errors. */
export const readFilesConfigSource = async (configPath: string): Promise<string | undefined> => {
    try {
        return await readFile(configPath, 'utf8')
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
        throw error
    }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)

const isUnconfiguredStorage = (storage: unknown): boolean =>
    storage == null || (isObject(storage) && Object.keys(storage).length === 0)

const hasEnvironmentStorage = (config: Record<string, unknown>): boolean =>
    [
        config.$development,
        config.$production,
        config.$test,
        config.$prerender,
        ...(isObject(config.$env) ? Object.values(config.$env) : []),
    ].some((branch) => isObject(branch) && !isUnconfiguredStorage(branch.storage))

export const loadFilesConfig = async ({
    configPath,
    environments,
    alias,
    injectImports,
    source,
    onSource,
    onUnconfigured,
}: FilesConfigLoaderOptions): Promise<FilesConfig | undefined> => {
    source ??= await readFilesConfigSource(configPath)
    if (source === undefined) {
        onUnconfigured?.()
        return undefined
    }
    const { loadConfig } = await import('c12')
    // A normal import cannot honor source aliases/injection or fresh referenced files.
    // Force source evaluation once; never retry an authored failure with another loader.
    const sdk = resolveOwnedSdk()
    const evaluate = await createFilesConfigEvaluator({
        alias: {
            ...registerSdkAliases(alias ?? {}, sdk),
            'nuxt-files-sdk/config': fileURLToPath(new URL('../config.js', import.meta.url)),
        },
        nativeRoots: [sdk.root],
        onSource,
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
            return evaluate(id, code)
        },
    })
    if (config.storage === undefined && layers?.some(({ config: layer }) => layer && hasEnvironmentStorage(layer)))
        return undefined
    if (isObject(config) && isUnconfiguredStorage(config.storage)) {
        onUnconfigured?.()
        return undefined
    }
    normalizeFilesConfig(config)
    // Storage is validated above; route validation follows during preparation.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return config as unknown as FilesConfig
}
