import type { FilesHooks, FilesOptions, FilesPlugin, ProviderSlug } from 'files-sdk'
import type { AuthorizeContext, AuthorizeResult, CreateFilesRouterOptions } from 'files-sdk/api'
import type { H3Event } from 'h3'

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

/** A Nitro route backed by the native Files SDK gateway. */
export type FilesRoute = Omit<CreateFilesRouterOptions, 'files' | 'authorize'> & {
    path: string
    storage?: string
    authorize?: (context: AuthorizeContext & { event: H3Event }) => AuthorizeResult | Promise<AuthorizeResult>
}

type SingleFilesRoute = FilesRoute & { storage?: never }
type NamedFilesRoute<Name extends string> = FilesRoute & { storage: Name }

/** One unnamed storage, available through `useServerFiles()`. */
export interface SingleFilesConfig<
    Storage extends StorageConfig = StorageConfig,
    Dev extends DevStorageConfig | undefined = DevStorageConfig | undefined,
> {
    /** Files SDK storage configuration. */
    storage: Storage
    /** Development-only provider settings. */
    devStorage?: Dev
    /** Application gateway routes; none are registered unless configured. */
    routes?: readonly SingleFilesRoute[]
}

/** Named storages, each requiring its name when accessed. */
export interface NamedFilesConfig<
    Storages extends Record<string, StorageConfig> = Record<string, StorageConfig>,
    Dev extends Partial<Record<keyof Storages, DevStorageConfig>> = Partial<Record<keyof Storages, DevStorageConfig>>,
> {
    /** Files SDK storage configuration. */
    storage: Storages
    /** Development-only provider settings keyed by storage name. */
    devStorage?: Dev
    /** Application gateway routes, each bound to one named storage. */
    routes?: readonly NamedFilesRoute<Extract<keyof Storages, string>>[]
}

/** One unnamed storage that exists only while the development server is running. */
export interface DevelopmentOnlySingleFilesConfig<Storage extends StorageConfig = StorageConfig> {
    storage?: never
    devStorage: Storage
    routes?: readonly SingleFilesRoute[]
}

/** Named storages that exist only while the development server is running. */
export interface DevelopmentOnlyNamedFilesConfig<
    Storages extends Record<string, StorageConfig> = Record<string, StorageConfig>,
> {
    storage?: never
    devStorage: Storages
    routes?: readonly NamedFilesRoute<Extract<keyof Storages, string>>[]
}

/** Files SDK configuration used by the Nuxt/Nitro integration. */
export type FilesConfig =
    | SingleFilesConfig
    | NamedFilesConfig<any>
    | DevelopmentOnlySingleFilesConfig
    | DevelopmentOnlyNamedFilesConfig<any>

/** Define one unnamed Files SDK storage while preserving its provider and plugin types. */
export function defineFilesConfig<
    const Storage extends StorageConfig,
    const Dev extends DevStorageConfig | undefined = undefined,
>(
    config: SingleFilesConfig<Storage, Dev> & {
        devStorage?: Dev & Record<Exclude<keyof Dev, 'adapter' | 'config'>, never>
    },
): SingleFilesConfig<Storage, Dev>
/** Define named Files SDK storages while preserving their names, providers, and plugin types. */
export function defineFilesConfig<
    const Storages extends Record<string, StorageConfig>,
    const Dev extends Partial<Record<keyof Storages, DevStorageConfig>> = Record<never, never>,
>(
    config: NamedFilesConfig<Storages, Dev> & {
        devStorage?: {
            [Name in keyof Dev]: Name extends keyof Storages
                ? Dev[Name] & Record<Exclude<keyof Dev[Name], 'adapter' | 'config'>, never>
                : never
        }
    },
): NamedFilesConfig<Storages, Dev>
/** Define one unnamed development-only storage. */
export function defineFilesConfig<const Storage extends StorageConfig>(
    config: DevelopmentOnlySingleFilesConfig<Storage>,
): DevelopmentOnlySingleFilesConfig<Storage>
/** Define named development-only storages. */
export function defineFilesConfig<const Storages extends Record<string, StorageConfig>>(
    config: DevelopmentOnlyNamedFilesConfig<Storages>,
): DevelopmentOnlyNamedFilesConfig<Storages>
export function defineFilesConfig(
    config: FilesConfig,
): FilesConfig | { storage: FilesConfig['storage']; routes?: FilesConfig['routes'] } {
    if (process.env.NODE_ENV !== 'production') return config
    return { storage: config.storage, ...(config.routes && { routes: config.routes }) }
}
