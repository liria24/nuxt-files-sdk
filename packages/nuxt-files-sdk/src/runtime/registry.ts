import {
    createFiles,
    type ExtensionsOf,
    type Files,
    type FilesActionEvent,
    type FilesErrorEvent,
    type FilesRetryEvent,
} from 'files-sdk'
import { loadFiles } from 'files-sdk/loader'
import { getProvider } from 'files-sdk/providers'

import type { FilesConfig, StorageConfig } from '../config'

export type FilesForStorage<T extends StorageConfig> = Files & ExtensionsOf<NonNullable<T['plugins']>>

export type StorageRegistry<C extends FilesConfig> = {
    [Name in keyof C['storage']]: FilesForStorage<C['storage'][Name]>
}

export interface FilesRuntimeHooks {
    onError?: (event: FilesErrorEvent, storage: string) => void | Promise<void>
    onAction?: (event: FilesActionEvent, storage: string) => void | Promise<void>
    onRetry?: (event: FilesRetryEvent, storage: string) => void | Promise<void>
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
        if (!(resolvedName in this.#config.storage)) {
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

    #defaultName(): string {
        if (this.#config.default) return this.#config.default
        const names = Object.keys(this.#config.storage)
        if (names.length === 1 && names[0]) return names[0]
        if ('default' in this.#config.storage) return 'default'
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
                onAction: (event) => {
                    userHooks?.onAction?.(event)
                    void this.#hooks.onAction?.(event, name)
                },
                onError: (event) => {
                    userHooks?.onError?.(event)
                    void this.#hooks.onError?.(event, name)
                },
                onRetry: (event) => {
                    userHooks?.onRetry?.(event)
                    void this.#hooks.onRetry?.(event, name)
                },
            },
            ...(plugins ? { plugins } : {}),
            ...(options.prefix === undefined ? {} : { prefix: options.prefix }),
            ...(options.retries === undefined ? {} : { retries: options.retries }),
            ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
        })
    }
}

/** Bridge only NUXT_ aliases declared by the configured native provider. */
export const withNuxtEnvironment = async <T>(provider: string, load: () => Promise<T>): Promise<T> => {
    const metadata = getProvider(provider)
    if (!metadata) return load()
    const variables = [
        ...(metadata.env.required ?? []),
        ...(metadata.env.optional ?? []),
        ...(metadata.env.credentialModes?.flatMap((group) => group.vars) ?? []),
    ]
    const injected: string[] = []
    for (const variable of variables) {
        for (const key of [variable.key, ...(variable.aliases ?? [])]) {
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
    }
}
