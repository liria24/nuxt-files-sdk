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
import { getProvider, listEnvVars } from 'files-sdk/providers'

import type { FilesConfig, NamedFilesConfig, SingleFilesConfig, StorageConfig } from '../config'
import type { FilesDevtoolsSnapshot } from '../devtools/snapshot'

/** Native Files client plus the methods contributed by a storage's plugins. */
export type FilesForStorage<T extends StorageConfig> = Files & ExtensionsOf<NonNullable<T['plugins']>>

/** Map each configured storage name to its native Files client and plugin extensions. */
export type StorageRegistry<C extends FilesConfig> =
    C extends NamedFilesConfig<infer Storages>
        ? { [Name in keyof Storages]: FilesForStorage<Storages[Name]> }
        : Record<never, never>

/** Files client returned by an unnamed single-storage configuration. */
export type SingleStorage<C extends FilesConfig> =
    C extends SingleFilesConfig<infer Storage> ? FilesForStorage<Storage> : never

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

const isStorageConfig = (value: unknown): value is StorageConfig =>
    Boolean(value && typeof value === 'object' && 'adapter' in value && typeof value.adapter === 'string')
const isStorageRecord = (value: unknown): value is Record<string, StorageConfig> =>
    Boolean(value && typeof value === 'object' && Object.values(value).every(isStorageConfig))

type StorageEntry = { name: string | undefined; storage: StorageConfig; override: StorageConfig | undefined }

/** Lazily construct and memoize native Files clients for a validated project configuration. */
export class FilesRegistry<const C extends FilesConfig = FilesConfig> {
    readonly #config: C
    readonly #development: boolean
    readonly #factories: FilesProviderFactories
    readonly #hooks: FilesRuntimeHooks
    readonly #instances = new Map<string, Files>()
    readonly #initializing = new Set<string>()

    /** Create a registry without constructing a provider. */
    constructor(
        config: C,
        options: {
            development?: boolean
            factories: FilesProviderFactories
            hooks?: FilesRuntimeHooks
        },
    ) {
        if ('default' in config) {
            throw new Error('[nuxt-files-sdk:invalid-config] The default option has been removed.')
        }
        if (
            !config.storage ||
            (!isStorageConfig(config.storage) &&
                (!isStorageRecord(config.storage) || Object.keys(config.storage).length === 0))
        ) {
            throw new Error('[nuxt-files-sdk:invalid-config] At least one storage is required.')
        }
        if (!isStorageConfig(config.storage)) {
            if (config.devStorage && !isStorageRecord(config.devStorage)) {
                throw new Error('[nuxt-files-sdk:invalid-config] Named storage requires named devStorage overrides.')
            }
            for (const name of Object.keys(config.devStorage ?? {})) {
                if (!Object.hasOwn(config.storage, name)) {
                    throw new Error(`[nuxt-files-sdk:unknown-storage] Unknown storage "${name}".`)
                }
            }
        }
        this.#config = config
        this.#development = options.development ?? false
        this.#factories = options.factories
        this.#hooks = options.hooks ?? {}
    }

    /** Return the client from an unnamed single-storage configuration. */
    get(...args: C extends SingleFilesConfig ? [] : [name: never]): SingleStorage<C>
    /** Return one named storage client. */
    get<Name extends Extract<keyof StorageRegistry<C>, string>>(name: Name): StorageRegistry<C>[Name]
    get(name?: string): Files {
        const entry = this.#entry(name)
        const key = entry.name ?? ''
        const cached = this.#instances.get(key)
        if (cached) return cached
        if (this.#initializing.has(key)) {
            throw new Error('[nuxt-files-sdk:circular-initialization] Storage configuration cannot access itself.')
        }
        this.#initializing.add(key)
        try {
            const files = this.#create(entry)
            this.#instances.set(key, files)
            return files
        } finally {
            this.#initializing.delete(key)
        }
    }

    /** Return secret-free storage metadata and initialization state for development diagnostics. */
    inspect(): FilesDevtoolsSnapshot {
        return {
            storages: this.#entries().map(({ name, storage, override }) => ({
                ...(name === undefined ? {} : { name }),
                adapter: override?.adapter ?? storage.adapter,
                plugins: storage.plugins?.map((plugin) => plugin.name) ?? [],
                source: override ? 'devStorage' : 'storage',
                initialized: this.#instances.has(name ?? ''),
            })),
            diagnostics: [],
        }
    }

    #entries(): StorageEntry[] {
        const storage = this.#config.storage
        const devStorage = this.#config.devStorage
        if (isStorageConfig(storage)) {
            const override = this.#development && isStorageConfig(devStorage) ? devStorage : undefined
            return [{ name: undefined, storage, override }]
        }
        const overrides = this.#development && isStorageRecord(devStorage) ? devStorage : undefined
        return Object.entries(storage).map(([name, namedStorage]) => ({
            name,
            storage: namedStorage,
            override: overrides?.[name],
        }))
    }

    #entry(name?: string): StorageEntry {
        if (isStorageConfig(this.#config.storage)) {
            if (name !== undefined) {
                throw new Error(`[nuxt-files-sdk:unknown-storage] Unknown storage "${name}".`)
            }
            return this.#entries()[0]!
        }
        if (name === undefined) {
            throw new Error('[nuxt-files-sdk:storage-name-required] A storage name is required.')
        }
        const entry = this.#entries().find((candidate) => candidate.name === name)
        if (!entry) throw new Error(`[nuxt-files-sdk:unknown-storage] Unknown storage "${name}".`)
        return entry
    }

    #create({ name, storage, override }: StorageEntry): Files {
        const selected = override ?? storage
        const factory = this.#factories[selected.adapter]
        if (!factory) {
            throw new Error(
                `[nuxt-files-sdk:adapter-not-generated] Adapter "${selected.adapter}" is not available in this build.`,
            )
        }
        const adapter = withNuxtEnvironment(selected.adapter, () => {
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
            ...(storage.prefix === undefined ? {} : { prefix: storage.prefix }),
            ...(storage.retries === undefined ? {} : { retries: storage.retries }),
            ...(storage.timeout === undefined ? {} : { timeout: storage.timeout }),
        })
    }
}

/** Bridge only NUXT_ aliases declared by the configured native provider during synchronous construction. */
export const withNuxtEnvironment = <T>(provider: ProviderSlug, load: () => T): T => {
    const metadata = getProvider(provider)
    if (!metadata) return load()
    const variables = listEnvVars(provider)
    if (variables.length === 0) return load()
    const injected: string[] = []
    for (const variable of variables) {
        const keys = [variable.key, ...(variable.aliases ?? [])]
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
