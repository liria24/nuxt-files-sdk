import { loadConfig } from 'c12'

import type { FilesConfig } from './config'
import { configureFiles, useServerFiles } from './runtime/context'
import { FilesRegistry } from './runtime/registry'

export interface NitroFilesOptions {
    /** Path relative to the Nitro project root. */
    config?: string
    development?: boolean
}

export const loadFilesConfig = async (cwd: string, configFile = 'files.config'): Promise<FilesConfig> => {
    const result = await loadConfig<FilesConfig>({ cwd, configFile, dotenv: true })
    if (!result.config) {
        throw new Error(`[nuxt-files-sdk:config-not-found] Could not load ${configFile} from ${cwd}.`)
    }
    return result.config
}

/** Standalone Nitro can initialize this from a Nitro plugin. */
export const setupNitroFiles = async (rootDir: string, options: NitroFilesOptions = {}) => {
    const config = await loadFilesConfig(rootDir, options.config ?? 'files.config')
    const runtimeOptions = options.development === undefined ? {} : { development: options.development }
    return configureFiles(config, runtimeOptions)
}

export { configureFiles, FilesRegistry, useServerFiles }
export type { FilesRuntimeHooks, StorageRegistry } from './runtime/registry'
