import {
    createFiles,
    type Adapter,
    type ExtensionsOf,
    type Files,
    type FilesActionEvent,
    type FilesErrorEvent,
    type FilesRetryEvent,
    type ProviderSlug,
} from 'files-sdk'

import type {
    DevelopmentOnlyNamedFilesConfig,
    DevelopmentOnlySingleFilesConfig,
    DevStorageConfig,
    FilesConfig,
    NamedFilesConfig,
    SingleFilesConfig,
    StorageConfig,
} from '../config'
import type { FilesDevtoolsDiagnosticCode } from '../devtools/diagnostics'
import { normalizeFilesConfig, type StorageEntry } from './normalize'
import type { ProviderFactories } from './provider-types'

/** Native Files client plus the methods contributed by a storage's plugins. */
type AdapterFor<A> = A extends ProviderSlug
    ? ReturnType<ProviderFactories[A]>
    : A extends (...args: never[]) => Adapter
      ? ReturnType<A>
      : never
type PluginsFor<T extends StorageConfig> =
    NonNullable<T['plugins']> extends (...args: never[]) => infer P
        ? P extends readonly import('files-sdk').FilesPlugin[]
            ? P
            : never
        : NonNullable<T['plugins']> extends readonly import('files-sdk').FilesPlugin[]
          ? NonNullable<T['plugins']>
          : never
export type FilesForStorage<T extends StorageConfig, Dev = never> = Files<
    AdapterFor<T['adapter'] | (Dev extends DevStorageConfig ? Dev['adapter'] : never)>
> &
    ExtensionsOf<PluginsFor<T>>

/** Map each configured storage name to its native Files client and plugin extensions. */
export type StorageRegistry<C extends FilesConfig> =
    C extends NamedFilesConfig<infer Storages, infer Dev>
        ? {
              [Name in keyof Storages]: FilesForStorage<
                  Storages[Name],
                  'devStorage' extends keyof C ? (Name extends keyof Dev ? Dev[Name] : never) : never
              >
          }
        : C extends DevelopmentOnlyNamedFilesConfig<infer Storages>
          ? { [Name in keyof Storages]: FilesForStorage<Storages[Name]> }
          : Record<never, never>

/** Files client returned by an unnamed single-storage configuration. */
export type SingleStorage<C extends FilesConfig> =
    C extends SingleFilesConfig<infer Storage, infer Dev>
        ? FilesForStorage<Storage, 'devStorage' extends keyof C ? Dev : never>
        : C extends DevelopmentOnlySingleFilesConfig<infer Storage>
          ? FilesForStorage<Storage>
          : never

/** Hooks emitted by the Nuxt/Nitro bridge after the storage's native hooks. */
export interface FilesRuntimeHooks {
    /** Observe a failed native Files operation. */
    onError?: (event: FilesErrorEvent, storage?: string) => void | Promise<void>
    /** Observe a completed native Files operation. */
    onAction?: (event: FilesActionEvent, storage?: string) => void | Promise<void>
    /** Observe a native Files retry. */
    onRetry?: (event: FilesRetryEvent, storage?: string) => void | Promise<void>
}

/** One provider factory statically supplied by the generated Nitro plugin. */
export type FilesProviderFactory = (config: never) => Adapter
/** Provider factories available in the current build. */
export type FilesProviderFactories = Partial<Record<ProviderSlug, FilesProviderFactory>>

const runHooks = async (...hooks: (() => void | Promise<void> | undefined)[]): Promise<void> => {
    for (const hook of hooks) {
        try {
            // Preserve user-before-bridge ordering without exposing hook failures to native operations.
            // oxlint-disable-next-line no-await-in-loop
            await hook()
        } catch {}
    }
}

const nativeFilesOptions = ({
    adapter: _adapter,
    config: _config,
    hooks: _hooks,
    plugins: _plugins,
    ...options
}: StorageConfig) => options

export type ProviderEnvironment = Partial<Record<ProviderSlug, readonly (readonly string[])[]>>
export interface RegistryDiagnostic {
    code: FilesDevtoolsDiagnosticCode
    name?: string
    adapter?: string
}

/** Lazily construct and memoize native Files clients for a validated project configuration. */
export class FilesRegistry<const C extends FilesConfig = FilesConfig> {
    readonly #entries: Map<string | undefined, StorageEntry>
    readonly #environment: ProviderEnvironment
    readonly #factories: FilesProviderFactories
    readonly #hooks: FilesRuntimeHooks
    readonly #adapters = new Map<string | undefined, Adapter>()
    readonly #adapterInitializing = new Set<string | undefined>()
    readonly #instances = new Map<string | undefined, Files>()
    readonly #filesInitializing = new Set<string | undefined>()
    readonly #pluginNames = new Map<string | undefined, string[]>()
    readonly #diagnostics = new Map<string | undefined, RegistryDiagnostic>()

    /** Create a registry without constructing a provider. */
    constructor(
        config: C,
        options: {
            development?: boolean
            environment?: ProviderEnvironment
            factories: FilesProviderFactories
            hooks?: FilesRuntimeHooks
        },
    ) {
        this.#entries = normalizeFilesConfig(config, options.development ?? false)
        if (!this.#entries.size) throw new Error('[nuxt-files-sdk:invalid-config] At least one storage is required.')
        this.#environment = options.environment ?? {}
        this.#factories = options.factories
        this.#hooks = options.hooks ?? {}
    }

    /** Return the client from an unnamed single-storage configuration. */
    get(...args: C extends SingleFilesConfig | DevelopmentOnlySingleFilesConfig ? [] : [name: never]): SingleStorage<C>
    /** Return one named storage client. */
    get<Name extends Extract<keyof StorageRegistry<C>, string>>(name: Name): StorageRegistry<C>[Name]
    get(name?: string): Files {
        const entry = this.#entry(name)
        const key = entry.name
        const cached = this.#instances.get(key)
        if (cached) return cached
        if (this.#filesInitializing.has(key)) throw this.#circular(key)
        this.#filesInitializing.add(key)
        try {
            const files = this.#create(entry)
            this.#instances.set(key, files)
            this.#diagnostics.delete(key)
            return files
        } catch (error) {
            this.#diagnostics.set(key, {
                code: 'NUXT_FILES_ADAPTER_INIT_FAILED',
                ...(entry.name === undefined ? {} : { name: entry.name }),
                adapter: typeof entry.selected.adapter === 'string' ? entry.selected.adapter : 'custom',
            })
            throw error
        } finally {
            this.#filesInitializing.delete(key)
        }
    }

    /** Return secret-free storage metadata and initialization state for development diagnostics. */
    inspect() {
        return {
            storages: [...this.#entries.values()].map(({ name, storage, selected, source }) => ({
                ...(name === undefined ? {} : { name }),
                adapter: typeof selected.adapter === 'string' ? selected.adapter : 'custom',
                plugins:
                    this.#pluginNames.get(name) ??
                    (Array.isArray(storage.plugins) ? storage.plugins.map((plugin) => plugin.name) : []),
                source,
                initialized: this.#instances.has(name),
            })),
            diagnostics: [...this.#diagnostics.values()],
        }
    }

    #entry(name?: string): StorageEntry {
        if (name === undefined && !this.#entries.has(undefined)) {
            throw new Error('[nuxt-files-sdk:storage-name-required] A storage name is required.')
        }
        const entry = this.#entries.get(name)
        if (!entry) throw new Error(`[nuxt-files-sdk:unknown-storage] Unknown storage "${name}".`)
        return entry
    }

    /** Resolve one selected adapter without constructing its Files client. */
    resolveAdapter(name?: string): Adapter {
        const entry = this.#entry(name)
        const key = entry.name
        const cached = this.#adapters.get(key)
        if (cached) return cached
        if (this.#adapterInitializing.has(key)) throw this.#circular(key)
        this.#adapterInitializing.add(key)
        try {
            const adapter = this.#createAdapter(entry)
            this.#adapters.set(key, adapter)
            return adapter
        } finally {
            this.#adapterInitializing.delete(key)
        }
    }

    #circular(name?: string): Error {
        return new Error(
            `[nuxt-files-sdk:circular-initialization] Circular storage dependency${name ? ` at "${name}"` : ''}.`,
        )
    }

    #createAdapter({ selected }: StorageEntry): Adapter {
        const factory = typeof selected.adapter === 'string' ? this.#factories[selected.adapter] : selected.adapter
        if (!factory) {
            throw new Error(
                `[nuxt-files-sdk:adapter-not-generated] Adapter "${typeof selected.adapter === 'string' ? selected.adapter : 'custom'}" is not available in this build.`,
            )
        }
        const environment = typeof selected.adapter === 'string' ? (this.#environment[selected.adapter] ?? []) : []
        return withNuxtEnvironment(environment, () => {
            const input = typeof selected.config === 'function' ? selected.config() : selected.config
            if (input && typeof input === 'object' && 'then' in input) {
                throw new Error('[nuxt-files-sdk:async-config] Storage config functions must be synchronous.')
            }
            const value =
                selected.adapter === 's3'
                    ? withS3NuxtCredentials(input)
                    : selected.adapter === 'bun-s3'
                      ? withBunS3NuxtOptions(input)
                      : input
            // Generated factories and configs share an adapter key; the broad registry type erases that correlation.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            return factory(value as never)
        })
    }

    #create({ name, storage }: StorageEntry): Files {
        const adapter = this.resolveAdapter(name)
        const plugins =
            typeof storage.plugins === 'function'
                ? storage.plugins({ storage: (storageName) => this.resolveAdapter(storageName) })
                : storage.plugins
        const files = createFiles({
            adapter,
            ...nativeFilesOptions(storage),
            hooks: {
                onAction: (event) =>
                    runHooks(
                        () => storage.hooks?.onAction?.(event),
                        () => this.#hooks.onAction?.(event, name),
                    ),
                onError: (event) =>
                    runHooks(
                        () => storage.hooks?.onError?.(event),
                        () => this.#hooks.onError?.(event, name),
                    ),
                onRetry: (event) =>
                    runHooks(
                        () => storage.hooks?.onRetry?.(event),
                        () => this.#hooks.onRetry?.(event, name),
                    ),
            },
            ...(plugins ? { plugins } : {}),
        })
        if (plugins)
            this.#pluginNames.set(
                name,
                plugins.map((plugin) => plugin.name),
            )
        return files
    }
}

/** Pass NUXT_ credentials explicitly because the AWS SDK resolves its chain after construction. */
const withS3NuxtCredentials = (input: unknown): unknown => {
    if (!input || typeof input !== 'object' || 'credentials' in input) return input
    if (
        [
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_PROFILE',
            'AWS_WEB_IDENTITY_TOKEN_FILE',
            'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
            'AWS_CONTAINER_CREDENTIALS_FULL_URI',
        ].some((key) => process.env[key] !== undefined)
    )
        return input
    const accessKeyId = process.env.NUXT_AWS_ACCESS_KEY_ID
    const secretAccessKey = process.env.NUXT_AWS_SECRET_ACCESS_KEY
    if (!accessKeyId || !secretAccessKey) return input
    return {
        ...input,
        credentials: {
            accessKeyId,
            secretAccessKey,
            ...((process.env.AWS_SESSION_TOKEN ?? process.env.NUXT_AWS_SESSION_TOKEN) && {
                sessionToken: process.env.AWS_SESSION_TOKEN ?? process.env.NUXT_AWS_SESSION_TOKEN,
            }),
        },
    }
}

/** Bun resolves these environment keys in its own client; pass NUXT_ aliases as explicit options. */
const withBunS3NuxtOptions = (input: unknown): unknown => {
    if (input && (typeof input !== 'object' || 'client' in input)) return input
    const options: Record<string, unknown> = { ...(typeof input === 'object' && input ? input : {}) }
    for (const [field, key, alias] of [
        ['accessKeyId', 'AWS_ACCESS_KEY_ID', 'S3_ACCESS_KEY_ID'],
        ['secretAccessKey', 'AWS_SECRET_ACCESS_KEY', 'S3_SECRET_ACCESS_KEY'],
        ['sessionToken', 'AWS_SESSION_TOKEN', 'S3_SESSION_TOKEN'],
        ['region', 'AWS_REGION', 'S3_REGION'],
        ['bucket', 'AWS_BUCKET', 'S3_BUCKET'],
    ] as const) {
        if (Object.hasOwn(options, field) || process.env[key] !== undefined || process.env[alias] !== undefined)
            continue
        const value = process.env[`NUXT_${key}`] ?? process.env[`NUXT_${alias}`]
        if (value !== undefined) options[field] = value
    }
    return options
}

/** Bridge only NUXT_ aliases declared by the configured native provider during synchronous construction. */
export const withNuxtEnvironment = <T>(variables: readonly (readonly string[])[], load: () => T): T => {
    const injected: string[] = []
    for (const keys of variables) {
        if (keys.some((key) => process.env[key] !== undefined)) continue
        for (const key of keys) {
            const value = process.env[`NUXT_${key}`]
            if (value !== undefined && process.env[key] === undefined) {
                process.env[key] = value
                injected.push(key)
            }
        }
    }
    try {
        return load()
    } finally {
        for (const key of injected) delete process.env[key]
    }
}
