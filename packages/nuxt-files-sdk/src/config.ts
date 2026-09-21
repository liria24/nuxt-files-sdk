import type { FilesHooks, FilesOptions, FilesPlugin, ProviderSlug } from 'files-sdk'

import type { ProviderFactories } from './runtime/provider-types'

type ProviderOptions<Provider extends ProviderSlug> = Parameters<ProviderFactories[Provider]>[0]
type ConfigValue<Provider extends ProviderSlug> = Exclude<ProviderOptions<Provider>, undefined>
type ConfigInput<Provider extends ProviderSlug> = ConfigValue<Provider> | (() => ConfigValue<Provider>)
type ProviderConfig<Provider extends ProviderSlug> = {
    /** Native provider factory options, or a synchronous runtime resolver for them. */
    config?: ConfigInput<Provider>
} & (undefined extends ProviderOptions<Provider> ? unknown : { config: ConfigInput<Provider> })
type CommonFilesOptions<Provider extends ProviderSlug> = Omit<
    FilesOptions<ReturnType<ProviderFactories[Provider]>>,
    'adapter' | 'hooks' | 'plugins'
>

/** Configuration for one Files SDK storage. */
export type StorageConfig<
    Provider extends ProviderSlug = ProviderSlug,
    Plugins extends readonly FilesPlugin[] = readonly FilesPlugin[],
> = Provider extends ProviderSlug
    ? {
          /** Files SDK provider slug, for example `r2`, `s3`, or `fs`. */
          adapter: Provider
          /** Native Files SDK plugins applied in array order. */
          plugins?: Plugins
          /** Native Files SDK lifecycle hooks. */
          hooks?: FilesHooks
      } & CommonFilesOptions<Provider> &
          ProviderConfig<Provider>
    : never

/** Development-only provider settings for a storage. */
export type DevStorageConfig<Provider extends ProviderSlug = ProviderSlug> = Provider extends ProviderSlug
    ? { adapter: Provider } & ProviderConfig<Provider>
    : never

/** One unnamed storage, available through `useServerFiles()`. */
export interface SingleFilesConfig<Storage extends StorageConfig = StorageConfig> {
    /** Files SDK storage configuration. */
    storage: Storage
    /** Development-only provider settings. */
    devStorage?: DevStorageConfig
}

/** Named storages, each requiring its name when accessed. */
export interface NamedFilesConfig<Storages extends Record<string, StorageConfig> = Record<string, StorageConfig>> {
    /** Files SDK storage configuration. */
    storage: Storages
    /** Development-only provider settings keyed by storage name. */
    devStorage?: Partial<{ [Name in keyof Storages]: DevStorageConfig }>
}

/** One unnamed storage that exists only while the development server is running. */
export interface DevelopmentOnlySingleFilesConfig<Storage extends StorageConfig = StorageConfig> {
    storage?: never
    devStorage: Storage
}

/** Named storages that exist only while the development server is running. */
export interface DevelopmentOnlyNamedFilesConfig<
    Storages extends Record<string, StorageConfig> = Record<string, StorageConfig>,
> {
    storage?: never
    devStorage: Storages
}

/** Files SDK configuration used by the Nuxt/Nitro integration. */
export type FilesConfig =
    | SingleFilesConfig
    | NamedFilesConfig
    | DevelopmentOnlySingleFilesConfig
    | DevelopmentOnlyNamedFilesConfig

/** Define one unnamed Files SDK storage while preserving its provider and plugin types. */
export function defineFilesConfig<const Storage extends StorageConfig>(
    config: SingleFilesConfig<Storage>,
): SingleFilesConfig<Storage>
/** Define named Files SDK storages while preserving their names, providers, and plugin types. */
export function defineFilesConfig<const Storages extends Record<string, StorageConfig>>(
    config: NamedFilesConfig<Storages>,
): NamedFilesConfig<Storages>
/** Define one unnamed development-only storage. */
export function defineFilesConfig<const Storage extends StorageConfig>(
    config: DevelopmentOnlySingleFilesConfig<Storage>,
): DevelopmentOnlySingleFilesConfig<Storage>
/** Define named development-only storages. */
export function defineFilesConfig<const Storages extends Record<string, StorageConfig>>(
    config: DevelopmentOnlyNamedFilesConfig<Storages>,
): DevelopmentOnlyNamedFilesConfig<Storages>
export function defineFilesConfig(config: FilesConfig): FilesConfig | { storage: FilesConfig['storage'] } {
    if (process.env.NODE_ENV !== 'production') return config
    return { storage: config.storage }
}
