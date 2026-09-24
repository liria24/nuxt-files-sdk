import type { Adapter, FilesHooks, FilesOptions, FilesPlugin, ProviderSlug } from 'files-sdk'
import type { AuthorizeContext, AuthorizeResult, CreateFilesRouterOptions } from 'files-sdk/api'
import type { H3Event } from 'h3'

import type { ProviderFactories } from './runtime/provider-types'

export type AdapterFactory = (...args: never[]) => Adapter
type StorageAdapter = ProviderSlug | AdapterFactory
export type FilesPluginContext = { storage: (name: string) => Adapter }
type FactoryFor<A extends StorageAdapter> = A extends ProviderSlug ? ProviderFactories[A] : A
type AdapterOptions<A extends StorageAdapter> =
    Parameters<FactoryFor<A>> extends []
        ? undefined
        : [Parameters<FactoryFor<A>>[0]] extends [never]
          ? unknown
          : Parameters<FactoryFor<A>>[0]
type AdapterConfig<A extends StorageAdapter> = {
    /** Native adapter factory options, or a synchronous runtime resolver for them. */
    config?: Exclude<AdapterOptions<A>, undefined> | (() => Exclude<AdapterOptions<A>, undefined>)
} & (undefined extends AdapterOptions<A>
    ? unknown
    : { config: Exclude<AdapterOptions<A>, undefined> | (() => Exclude<AdapterOptions<A>, undefined>) })
type CommonFilesOptions<A extends StorageAdapter> = Omit<
    FilesOptions<ReturnType<FactoryFor<A>>>,
    'adapter' | 'hooks' | 'plugins'
>

/** Configuration for one Files SDK storage. */
export type StorageConfig<
    Provider extends StorageAdapter = StorageAdapter,
    Plugins extends readonly FilesPlugin[] = readonly FilesPlugin[],
> = Provider extends StorageAdapter
    ? {
          /** Files SDK provider slug or a compatible adapter factory. */
          adapter: Provider
          /** Native Files SDK plugins applied in array order. */
          plugins?: Plugins | ((context: FilesPluginContext) => Plugins)
          /** Native Files SDK lifecycle hooks. */
          hooks?: FilesHooks
      } & CommonFilesOptions<Provider> &
          AdapterConfig<Provider>
    : never

/** Development-only provider settings for a storage. */
export type DevStorageConfig<Provider extends StorageAdapter = StorageAdapter> = Provider extends StorageAdapter
    ? { adapter: Provider } & AdapterConfig<Provider>
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
    const Factory extends AdapterFactory,
    const Storage extends StorageConfig<Factory>,
    const Dev extends DevStorageConfig | undefined = undefined,
>(
    config: SingleFilesConfig<Storage, Dev> & {
        storage: { adapter: Factory } & AdapterConfig<NoInfer<Factory>>
        devStorage?: Dev & Record<Exclude<keyof Dev, 'adapter' | 'config'>, never>
    },
): SingleFilesConfig<Storage, Dev>
/** Define one unnamed Files SDK storage while preserving its provider and plugin types. */
export function defineFilesConfig<
    const Storage extends StorageConfig<ProviderSlug>,
    const Dev extends DevStorageConfig | undefined = undefined,
>(
    config: SingleFilesConfig<Storage, Dev> & {
        devStorage?: Dev & Record<Exclude<keyof Dev, 'adapter' | 'config'>, never>
    },
): SingleFilesConfig<Storage, Dev>
/** Define named storages including custom adapter factories. */
export function defineFilesConfig<
    const Storages extends Record<string, StorageConfig>,
    const Dev extends Partial<Record<keyof Storages, DevStorageConfig>> = Record<never, never>,
>(
    config: NamedFilesConfig<Storages, Dev> & {
        storage: { [Name in keyof Storages]: Storages[Name] & StorageConfig<NoInfer<Storages[Name]['adapter']>> }
        devStorage?: {
            [Name in keyof Dev]: Name extends keyof Storages
                ? Dev[Name] & Record<Exclude<keyof Dev[Name], 'adapter' | 'config'>, never>
                : never
        }
    },
): NamedFilesConfig<Storages, Dev>
/** Define named Files SDK storages while preserving their names, providers, and plugin types. */
export function defineFilesConfig<
    const Storages extends Record<string, StorageConfig<ProviderSlug>>,
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
