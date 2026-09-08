import type { Files } from 'files-sdk'

import type { FilesConfig } from './config'
import type { FilesDevtoolsSnapshot } from './devtools/snapshot'
import { FilesRegistry } from './runtime/registry'

export { FilesRegistry } from './runtime/registry'
export type {
    DefaultStorage,
    DefaultStorageName,
    FilesForStorage,
    FilesRuntimeHooks,
    StorageRegistry,
} from './runtime/registry'

/** Project storage names and plugin-extended Files clients supplied by generated declarations. */
export interface NuxtFilesStorageRegistry {}
/** Project default Files client supplied by generated declarations. */
export interface NuxtFilesDefaultStorage {}

let registry: FilesRegistry | undefined

/** Configure the process-local Files registry used by {@link useServerFiles}. */
export const configureFiles = <const C extends FilesConfig>(
    config: C,
    options?: ConstructorParameters<typeof FilesRegistry<C>>[1],
): FilesRegistry<C> => {
    const value = new FilesRegistry(config, options)
    registry = value
    return value
}

/** Return secret-free diagnostics for the configured process-local Files registry. */
export const inspectFiles = (): FilesDevtoolsSnapshot =>
    registry?.inspect() ?? {
        storages: [],
        diagnostics: [
            {
                code: 'NUXT_FILES_NOT_CONFIGURED',
                level: 'warning',
                message: 'The Files registry has not been configured.',
            },
        ],
    }

/** Return the project's default Files client, including its configured plugin extensions. */
export function useServerFiles(): Promise<NuxtFilesDefaultStorage extends { value: infer Default } ? Default : Files>
/** Return a named project Files client, including that storage's configured plugin extensions. */
export function useServerFiles<Name extends Extract<keyof NuxtFilesStorageRegistry, string>>(
    name: Name,
): Promise<NuxtFilesStorageRegistry[Name]>
export function useServerFiles(name?: string): Promise<Files> {
    if (!registry) {
        throw new Error('[nuxt-files-sdk:not-configured] The Files registry has not been configured.')
    }
    return name === undefined ? registry.get() : registry.get(name)
}
