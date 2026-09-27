import { sync, transfer, type Files, type SyncOptions, type TransferOptions } from 'files-sdk'

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

type FilesInput<Name extends string = Extract<keyof NuxtFilesStorageRegistry, string>> = Files | Name

/** Delegate a mirror operation to the native Files SDK. */
export const syncFiles = (source: FilesInput, destination: FilesInput, options?: SyncOptions) =>
    sync(
        typeof source === 'string' ? getFiles(source) : source,
        typeof destination === 'string' ? getFiles(destination) : destination,
        options,
    )

/** Delegate a transfer operation to the native Files SDK. */
export const transferFiles = (source: FilesInput, destination: FilesInput, options?: TransferOptions) =>
    transfer(
        typeof source === 'string' ? getFiles(source) : source,
        typeof destination === 'string' ? getFiles(destination) : destination,
        options,
    )
