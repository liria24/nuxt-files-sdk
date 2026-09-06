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

/** Project storage names are merged into this interface by the generated declaration. */
export interface NuxtFilesStorageRegistry {}
/** Generated from the project's default-storage selection. */
export interface NuxtFilesDefaultStorage {}

let registry: FilesRegistry | undefined

export const configureFiles = <const C extends FilesConfig>(
    config: C,
    options?: ConstructorParameters<typeof FilesRegistry<C>>[1],
): FilesRegistry<C> => {
    const value = new FilesRegistry(config, options)
    registry = value
    return value
}

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

export function useServerFiles(): Promise<NuxtFilesDefaultStorage extends { value: infer Default } ? Default : Files>
export function useServerFiles<Name extends Extract<keyof NuxtFilesStorageRegistry, string>>(
    name: Name,
): Promise<NuxtFilesStorageRegistry[Name]>
export function useServerFiles(name?: string): Promise<Files> {
    if (!registry) {
        throw new Error('[nuxt-files-sdk:not-configured] The Files registry has not been configured.')
    }
    return registry.get(name)
}
