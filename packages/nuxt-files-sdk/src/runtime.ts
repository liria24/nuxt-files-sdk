import type { Files } from 'files-sdk'

import { getFiles } from './runtime/internal'

export type { FilesForStorage, SingleStorage, StorageRegistry } from './runtime/registry'

/** Project storage names and plugin-extended Files clients supplied by generated declarations. */
export interface NuxtFilesStorageRegistry {}
/** Project single Files client supplied by generated declarations. */
export interface NuxtFilesSingleStorage {}

/** Return the project's unnamed Files client, including its configured plugin extensions. */
export function useServerFiles(
    ...args: keyof NuxtFilesStorageRegistry extends never ? [] : [name: never]
): NuxtFilesSingleStorage extends { value: infer Single } ? Single : Files
/** Return a named project Files client, including that storage's configured plugin extensions. */
export function useServerFiles<Name extends Extract<keyof NuxtFilesStorageRegistry, string>>(
    name: Name,
): NuxtFilesStorageRegistry[Name]
export function useServerFiles(name?: string): Files {
    return getFiles(name)
}
