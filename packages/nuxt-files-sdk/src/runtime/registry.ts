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

export type FilesForStorage<T extends StorageConfig> = Files & ExtensionsOf<NonNullable<T['plugins']>>

export type StorageRegistry<C extends FilesConfig> = {
    [Name in keyof C['storage']]: FilesForStorage<C['storage'][Name]>
}

type IsUnion<T, C = T> = T extends C ? ([C] extends [T] ? false : true) : never

export type DefaultStorageName<C extends FilesConfig> = C extends {
    default: infer Name extends Extract<keyof C['storage'], string>
}
    ? Name
    : 'default' extends keyof C['storage']
      ? 'default'
      : IsUnion<Extract<keyof C['storage'], string>> extends false
        ? Extract<keyof C['storage'], string>
        : never

export type DefaultStorage<C extends FilesConfig> = StorageRegistry<C>[DefaultStorageName<C>]

export interface FilesRuntimeHooks {
    onError?: (event: FilesErrorEvent, storage: string) => void | Promise<void>
    onAction?: (event: FilesActionEvent, storage: string) => void | Promise<void>
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

export class FilesRegistry<const C extends FilesConfig = FilesConfig> {
    readonly #config: C
    readonly #development: boolean
    readonly #hooks: FilesRuntimeHooks
    readonly #instances = new Map<string, Promise<Files>>()

    constructor(config: C, options: { development?: boolean; hooks?: FilesRuntimeHooks } = {}) {
        if (!config.storage || Object.keys(config.storage).length === 0) {
            throw new Error('[nuxt-files-sdk:invalid-config] At least one storage is required.')
        }
        this.#config = config
        this.#development = options.development ?? false
        this.#hooks = options.hooks ?? {}
    }

    get<Name extends keyof C['storage'] & string>(name?: Name): Promise<StorageRegistry<C>[Name]> {
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
        // The instance is created from the same named config; the loader cannot express that link.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        return instance as Promise<StorageRegistry<C>[Name]>
    }

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
        if (this.#config.default) return this.#config.default
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
    // ponytail: global lock; remove when Files SDK accepts an injectable env resolver.
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
