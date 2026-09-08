import {
    createFiles,
    type ExtensionsOf,
    type Files,
    type FilesActionEvent,
    type FilesErrorEvent,
    type FilesRetryEvent,
    type ProviderSlug,
} from 'files-sdk'
import { loadFiles } from 'files-sdk/loader'
import { getProvider, listEnvVars } from 'files-sdk/providers'

import type { FilesConfig, StorageConfig } from '../config'
import type { FilesDevtoolsSnapshot } from '../devtools/snapshot'

/** Native Files client plus the methods contributed by a storage's plugins. */
export type FilesForStorage<T extends StorageConfig> = Files & ExtensionsOf<NonNullable<T['plugins']>>

/** Map each configured storage name to its native Files client and plugin extensions. */
export type StorageRegistry<C extends FilesConfig> = {
    [Name in keyof C['storage']]: FilesForStorage<C['storage'][Name]>
}

type IsUnion<T, C = T> = T extends C ? ([C] extends [T] ? false : true) : never

/** Resolve the explicit, conventional, or only storage name used by an unnamed access. */
export type DefaultStorageName<C extends FilesConfig> = C extends {
    default: infer Name extends Extract<keyof C['storage'], string>
}
    ? Name
    : 'default' extends keyof C['storage']
      ? 'default'
      : IsUnion<Extract<keyof C['storage'], string>> extends false
        ? Extract<keyof C['storage'], string>
        : never

/** Files client and plugin extensions returned for a configuration's default storage. */
export type DefaultStorage<C extends FilesConfig> = StorageRegistry<C>[DefaultStorageName<C>]

/** Hooks emitted by the Nuxt/Nitro bridge after the storage's native hooks. */
export interface FilesRuntimeHooks {
    /** Observe a failed native Files operation. */
    onError?: (event: FilesErrorEvent, storage: string) => void | Promise<void>
    /** Observe a completed native Files operation. */
    onAction?: (event: FilesActionEvent, storage: string) => void | Promise<void>
    /** Observe a native Files retry. */
    onRetry?: (event: FilesRetryEvent, storage: string) => void | Promise<void>
}

const runHooks = async (...hooks: (() => void | Promise<void> | undefined)[]): Promise<void> => {
    for (const hook of hooks) {
        try {
            // Preserve user-before-bridge ordering without exposing hook failures to native operations.
            // oxlint-disable-next-line no-await-in-loop
            await hook()
        } catch {}
    }
}

/** Lazily initialize and memoize native Files clients for a validated project configuration. */
export class FilesRegistry<const C extends FilesConfig = FilesConfig> {
    readonly #config: C
    readonly #development: boolean
    readonly #hooks: FilesRuntimeHooks
    readonly #instances = new Map<string, Promise<Files>>()

    /**
     * Create a registry and validate storage references without initializing or connecting to a provider.
     */
    constructor(config: C, options: { development?: boolean; hooks?: FilesRuntimeHooks } = {}) {
        if (!config.storage || Object.keys(config.storage).length === 0) {
            throw new Error('[nuxt-files-sdk:invalid-config] At least one storage is required.')
        }
        for (const name of [config.default, ...Object.keys(config.devStorage ?? {})]) {
            if (name !== undefined && !Object.hasOwn(config.storage, name)) {
                throw new Error(`[nuxt-files-sdk:unknown-storage] Unknown storage "${name}".`)
            }
        }
        this.#config = config
        this.#development = options.development ?? false
        this.#hooks = options.hooks ?? {}
    }

    /** Return the default storage, sharing its in-flight initialization Promise. */
    get(name?: undefined): Promise<DefaultStorage<C>>
    /** Return a named storage with its plugin extensions, sharing its in-flight initialization Promise. */
    get<Name extends keyof C['storage'] & string>(name: Name): Promise<StorageRegistry<C>[Name]>
    get(name?: string): Promise<Files> {
        const resolvedName = name ?? this.#defaultName()
        if (!Object.hasOwn(this.#config.storage, resolvedName)) {
            throw new Error(`[nuxt-files-sdk:unknown-storage] Unknown storage "${resolvedName}".`)
        }
        let instance = this.#instances.get(resolvedName)
        if (!instance) {
            instance = this.#create(resolvedName)
            this.#instances.set(resolvedName, instance)
            void instance.catch(() => this.#instances.delete(resolvedName))
        }
        return instance
    }

    /** Return secret-free storage metadata and initialization state for development diagnostics. */
    inspect(): FilesDevtoolsSnapshot {
        return {
            storages: Object.entries(this.#config.storage).map(([name, storage]) => {
                const override = this.#development ? this.#config.devStorage?.[name] : undefined
                return {
                    name,
                    adapter: override?.adapter ?? storage.adapter,
                    plugins: storage.plugins?.map((plugin) => plugin.name) ?? [],
                    source: override ? 'devStorage' : 'storage',
                    initialized: this.#instances.has(name),
                }
            }),
            diagnostics: [],
        }
    }

    #defaultName(): string {
        if (this.#config.default !== undefined) return this.#config.default
        const names = Object.keys(this.#config.storage)
        if (names.length === 1 && names[0]) return names[0]
        if (Object.hasOwn(this.#config.storage, 'default')) return 'default'
        throw new Error('[nuxt-files-sdk:storage-name-required] A storage name is required.')
    }

    async #create(name: string): Promise<Files> {
        const base = this.#config.storage[name]
        const override = this.#development ? this.#config.devStorage?.[name] : undefined
        const selected = override ? { ...base, ...override, plugins: base?.plugins, hooks: base?.hooks } : base
        if (!selected) throw new Error(`[nuxt-files-sdk:unknown-storage] Unknown storage "${name}".`)
        const { adapter, plugins, hooks: userHooks, ...options } = selected
        const loaded = await withNuxtEnvironment(adapter, () => loadFiles({ ...options, provider: adapter }))
        // The upstream loader has no hooks/plugins input. Avoid rebuilding the
        // native instance unless those native capabilities are actually used.
        if (!plugins && !userHooks && !Object.values(this.#hooks).some(Boolean)) return loaded.files
        return createFiles({
            adapter: loaded.files.adapter,
            hooks: {
                onAction: (event) =>
                    runHooks(
                        () => userHooks?.onAction?.(event),
                        () => this.#hooks.onAction?.(event, name),
                    ),
                onError: (event) =>
                    runHooks(
                        () => userHooks?.onError?.(event),
                        () => this.#hooks.onError?.(event, name),
                    ),
                onRetry: (event) =>
                    runHooks(
                        () => userHooks?.onRetry?.(event),
                        () => this.#hooks.onRetry?.(event, name),
                    ),
            },
            ...(plugins ? { plugins } : {}),
            ...(options.prefix === undefined ? {} : { prefix: options.prefix }),
            ...(options.retries === undefined ? {} : { retries: options.retries }),
            ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
        })
    }
}

let environmentLock = Promise.resolve()

/** Bridge only NUXT_ aliases declared by the configured native provider. */
export const withNuxtEnvironment = async <T>(provider: ProviderSlug, load: () => Promise<T>): Promise<T> => {
    const metadata = getProvider(provider)
    if (!metadata) return load()
    const variables = listEnvVars(provider)
    if (variables.length === 0) return load()
    // ponytail: module-local env lock; use native env keys to avoid temporary aliases.
    const previous = environmentLock
    let release!: () => void
    environmentLock = new Promise<void>((resolveLock) => (release = resolveLock))
    await previous
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
        return await load()
    } finally {
        for (const key of injected) delete process.env[key]
        release()
    }
}
