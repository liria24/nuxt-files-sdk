import type { Files } from 'files-sdk'

import type { FilesConfig } from '../config'
import { FilesRegistry } from './registry'

let registry: FilesRegistry | undefined

export const setFilesRegistry = <C extends FilesConfig>(value: FilesRegistry<C>): void => {
    registry = value
}

export const configureFiles = <const C extends FilesConfig>(
    config: C,
    options?: ConstructorParameters<typeof FilesRegistry<C>>[1],
): FilesRegistry<C> => {
    const value = new FilesRegistry(config, options)
    setFilesRegistry(value)
    return value
}

/** Project storage names are merged into this interface by the generated Nuxt declaration. */
export interface NuxtFilesStorageRegistry {}
/** Generated from the project's default-storage selection. */
export interface NuxtFilesDefaultStorage {}

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
