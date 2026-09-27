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
          plugins?: Plugins | ((context: FilesPluginContext) => Plugins)
          hooks?: FilesHooks
      } & CommonFilesOptions<Provider> &
          AdapterConfig<Provider>
    : never

export type FilesRoute = Omit<CreateFilesRouterOptions, 'files' | 'authorize'> & {
    path: string
    storage?: string
    authorize?: (context: AuthorizeContext & { event: H3Event }) => AuthorizeResult | Promise<AuthorizeResult>
}

export type StorageSet = StorageConfig | Record<string, StorageConfig>
/** One environment's Files options, before or after resolution. */
export interface FilesEnvironmentConfig {
    storage?: StorageSet
    routes?: readonly FilesRoute[]
}
/** User-authored configuration. Environment blocks can override every Files option. */
export interface FilesConfigInput extends FilesEnvironmentConfig {
    /** Overrides applied by the development server. */
    $development?: FilesEnvironmentConfig
    $production?: FilesEnvironmentConfig
    $test?: FilesEnvironmentConfig
    $prerender?: FilesEnvironmentConfig
    $env?: Record<string, FilesEnvironmentConfig>
}
/** Environment-resolved runtime configuration. */
export interface FilesConfig extends FilesEnvironmentConfig {
    storage: StorageSet
}
export interface SingleFilesConfig extends FilesConfig {
    /** Files SDK storage configuration. */
    storage: StorageConfig
}
export interface NamedFilesConfig extends FilesConfig {
    storage: Record<string, StorageConfig>
}

type EntryCheck<T> = T extends { adapter: infer A extends StorageAdapter }
    ? T extends StorageConfig<A>
        ? Record<Exclude<keyof T, keyof StorageConfig<A>>, never>
        : StorageConfig<A>
    : never
type StorageCheck<T> = T extends { adapter: unknown }
    ? EntryCheck<T>
    : T extends Record<string, unknown>
      ? { [K in keyof T]: EntryCheck<T[K]> }
      : never
type StorageOf<T> = T extends { storage: infer S } ? S : never
type StorageBranches<T> =
    | StorageOf<T>
    | StorageOf<T extends { $development: infer E } ? E : never>
    | StorageOf<T extends { $production: infer E } ? E : never>
    | StorageOf<T extends { $test: infer E } ? E : never>
    | StorageOf<T extends { $prerender: infer E } ? E : never>
    | StorageOf<T extends { $env: infer E } ? E[keyof E] : never>
type StorageNames<T> =
    StorageBranches<T> extends infer S
        ? S extends { adapter: unknown }
            ? never
            : S extends object
              ? Extract<keyof S, string>
              : never
        : never
type RouteCheck<T> = FilesRoute &
    ([StorageNames<T>] extends [never] ? { storage?: never } : { storage: StorageNames<T> })
type EnvironmentCheck<T, Root> = T extends object
    ? Record<Exclude<keyof T, 'storage' | 'routes'>, never> &
          (T extends { storage: infer S } ? { storage: S & StorageCheck<S> } : unknown) &
          (T extends { routes: unknown } ? { routes: readonly RouteCheck<Root>[] } : unknown)
    : never
type InputCheck<T> = Record<
    Exclude<keyof T, 'storage' | 'routes' | '$development' | '$production' | '$test' | '$prerender' | '$env'>,
    never
> &
    (T extends { storage: infer S } ? { storage: S & StorageCheck<S> } : unknown) &
    (T extends { routes: unknown } ? { routes: readonly RouteCheck<T>[] } : unknown) & {
        [K in Extract<keyof T, '$development' | '$production' | '$test' | '$prerender'>]: T[K] &
            EnvironmentCheck<T[K], T>
    } & (T extends { $env: infer E extends Record<string, unknown> }
        ? { $env: { [K in keyof E]: E[K] & EnvironmentCheck<E[K], T> } }
        : unknown)

/** Preserve storage names, adapters, and plugin literals without resolving an environment. */
export function defineFilesConfig<const C extends object>(config: C & FilesConfigInput & InputCheck<NoInfer<C>>): C {
    return config
}
