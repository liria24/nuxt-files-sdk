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
export type FilesForStorage<T extends StorageConfig, Dev = never> = Files<
    ReturnType<ProviderFactories[T['adapter'] | (Dev extends DevStorageConfig ? Dev['adapter'] : never)]>
> &
    ExtensionsOf<NonNullable<T['plugins']>>

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
    readonly #instances = new Map<string | undefined, Files>()
    readonly #initializing = new Set<string | undefined>()
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
        if (this.#initializing.has(key)) {
            throw new Error('[nuxt-files-sdk:circular-initialization] Storage configuration cannot access itself.')
        }
        this.#initializing.add(key)
        try {
            const files = this.#create(entry)
            this.#instances.set(key, files)
            this.#diagnostics.delete(key)
            return files
        } catch (error) {
            this.#diagnostics.set(key, {
                code: 'NUXT_FILES_ADAPTER_INIT_FAILED',
                ...(entry.name === undefined ? {} : { name: entry.name }),
                adapter: entry.selected.adapter,
            })
            throw error
        } finally {
            this.#initializing.delete(key)
        }
    }

    /** Return secret-free storage metadata and initialization state for development diagnostics. */
    inspect() {
        return {
            storages: [...this.#entries.values()].map(({ name, storage, selected, source }) => ({
                ...(name === undefined ? {} : { name }),
                adapter: selected.adapter,
                plugins: storage.plugins?.map((plugin) => plugin.name) ?? [],
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

    #create({ name, storage, selected }: StorageEntry): Files {
        const factory = this.#factories[selected.adapter]
        if (!factory) {
            throw new Error(
                `[nuxt-files-sdk:adapter-not-generated] Adapter "${selected.adapter}" is not available in this build.`,
            )
        }
        const adapter = withNuxtEnvironment(this.#environment[selected.adapter] ?? [], () => {
            const input = typeof selected.config === 'function' ? selected.config() : selected.config
            if (input && typeof input === 'object' && 'then' in input) {
                throw new Error('[nuxt-files-sdk:async-config] Storage config functions must be synchronous.')
            }
            // Generated factories and configs share an adapter key; the broad registry type erases that correlation.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            return factory(input as never)
        })
        return createFiles({
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
            ...(storage.plugins ? { plugins: storage.plugins } : {}),
        })
    }
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
