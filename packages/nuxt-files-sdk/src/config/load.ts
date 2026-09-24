import { readFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadConfig } from 'c12'
import { createJiti } from 'jiti'

import type { FilesConfig } from '../config'
import { normalizeFilesConfig } from '../runtime/normalize'
import { mergeFilesConfig } from './merge'

export interface FilesConfigLoaderOptions {
    configPath: string
    environments: readonly string[]
    alias?: Record<string, string> | undefined
    injectImports?: ((code: string, id?: string) => Promise<{ code: string }>) | undefined
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
const isResolvedFilesConfig = (value: unknown): value is FilesConfig => {
    normalizeFilesConfig(value)
    return true
}

/** c12 selects the first environment; a later prerender override is applied with the same merger. */
export const loadFilesConfig = async ({
    configPath,
    environments,
    alias,
    injectImports,
}: FilesConfigLoaderOptions): Promise<FilesConfig> => {
    const jiti = createJiti(import.meta.url, {
        alias: {
            ...alias,
            'nuxt-files-sdk/config': fileURLToPath(new URL('../config.js', import.meta.url)),
        },
        interopDefault: true,
        moduleCache: false,
    })
    const importer = Object.assign(jiti, {
        import: async (id: string) => {
            const source = await readFile(id, 'utf8')
            const code = injectImports ? (await injectImports(source, id)).code : source
            const loaded: unknown = await jiti.evalModule(code, { filename: id, async: true })
            return loaded && typeof loaded === 'object' && 'default' in loaded ? loaded.default : loaded
        },
    })
    const { config } = await loadConfig<Record<string, unknown>>({
        cwd: dirname(configPath),
        configFile: basename(configPath),
        configFileRequired: true,
        rcFile: false,
        extend: false,
        envName: environments[0] ?? false,
        jiti: importer,
        merger: mergeFilesConfig,
    })
    let resolved: Record<string, unknown> = config
    for (const environment of environments.slice(1)) {
        const direct = resolved[`$${environment}`]
        const named = isObject(resolved.$env) ? resolved.$env[environment] : undefined
        resolved = mergeFilesConfig(
            { ...(isObject(direct) ? direct : {}), ...(isObject(named) ? named : {}) },
            resolved,
        )
    }
    const result: unknown = Object.fromEntries(Object.entries(resolved).filter(([key]) => !key.startsWith('$')))
    if (!isResolvedFilesConfig(result))
        throw new Error('[nuxt-files-sdk:invalid-config] Invalid resolved configuration.')
    return result
}
