import type { FilesHooks, FilesPlugin, ProviderSlug } from 'files-sdk'
import type { LoadFilesOptions } from 'files-sdk/loader'

// TODO(files-sdk): consume upstream generic provider option types when the native loader exports them.
export type StorageConfig<Plugins extends readonly FilesPlugin[] = readonly FilesPlugin[]> = Omit<
    LoadFilesOptions,
    'provider'
> & {
    /** Files SDK provider subpath, for example `r2`, `s3`, or `fs`. */
    adapter: ProviderSlug
    /** Native Files SDK plugins, applied in array order. */
    plugins?: Plugins
    /** Native Files SDK hooks. They run before the integration hook bridge. */
    hooks?: FilesHooks
}

export type DevStorageConfig = Omit<StorageConfig, 'plugins' | 'hooks'> & {
    /** Plugins belong to the logical storage and cannot be replaced in development. */
    plugins?: never
    /** Hooks belong to the logical storage and cannot be replaced in development. */
    hooks?: never
}

export interface FilesConfig<Storage extends Record<string, StorageConfig> = Record<string, StorageConfig>> {
    /** Storage used when useServerFiles() is called without a name. */
    default?: keyof Storage & string
    /** Explicit development overrides. These never act as failure fallbacks. */
    devStorage?: Partial<{ [Name in keyof Storage]: DevStorageConfig }>
    storage: Storage
}

/** Preserve storage names and plugin tuples for generated/project types. */
export const defineFilesConfig = <const Config extends FilesConfig>(config: Config): Config => config
