import type { FilesHooks, FilesPlugin, ProviderSlug } from 'files-sdk'
import type { LoadFilesOptions } from 'files-sdk/loader'

/** Configuration for one named Files SDK storage. */
export type StorageConfig<Plugins extends readonly FilesPlugin[] = readonly FilesPlugin[]> = Omit<
    LoadFilesOptions,
    'provider'
> & {
    /** Files SDK provider slug, for example `r2`, `s3`, or `fs`. */
    adapter: ProviderSlug
    /** Native Files SDK plugins applied in array order. Their extensions are reflected in the storage type. */
    plugins?: Plugins
    /** Native Files SDK lifecycle hooks. They run before the Nuxt/Nitro integration hooks. */
    hooks?: FilesHooks
}

/** Development-only connection settings for a storage declared in {@link FilesConfig.storage}. */
export type DevStorageConfig = Omit<StorageConfig, 'plugins' | 'hooks'> & {
    /** Plugins belong to the logical storage and cannot be replaced in development. */
    plugins?: never
    /** Hooks belong to the logical storage and cannot be replaced in development. */
    hooks?: never
}

/** Files SDK storages and development overrides used by the Nuxt/Nitro integration. */
export interface FilesConfig<Storage extends Record<string, StorageConfig> = Record<string, StorageConfig>> {
    /** Storage used by `useServerFiles()` and `FilesRegistry.get()` when no name is passed. */
    default?: keyof Storage & string
    /** Development-only connection overrides keyed by a name in {@link storage}; never used as failure fallbacks. */
    devStorage?: Partial<{ [Name in keyof Storage]: DevStorageConfig }>
    /** Named storages, each initialized lazily on first access. */
    storage: Storage
}

/** Define a Files SDK configuration while preserving storage names and plugin tuples for generated types. */
export const defineFilesConfig = <
    const Storage extends Record<string, StorageConfig>,
    const Config extends FilesConfig<Storage>,
>(
    config: Config & FilesConfig<Storage> & { storage: Storage },
): Config => config
