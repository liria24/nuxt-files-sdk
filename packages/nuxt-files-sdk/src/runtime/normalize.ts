import type { StorageConfig } from '../config'

export interface StorageEntry {
    name: string | undefined
    storage: StorageConfig
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
const isStorage = (value: unknown): value is StorageConfig =>
    isObject(value) && (typeof value.adapter === 'string' || typeof value.adapter === 'function')

/** Validate one resolved config without selecting an environment or evaluating provider options. */
export const normalizeFilesConfig = (config: unknown): Map<string | undefined, StorageEntry> => {
    if (!isObject(config)) throw new Error('[nuxt-files-sdk:invalid-config] Files configuration must be an object.')
    const { storage } = config
    if (!isObject(storage)) throw new Error('[nuxt-files-sdk:invalid-config] At least one storage is required.')
    const entries = new Map<string | undefined, StorageEntry>()
    if (isStorage(storage)) {
        entries.set(undefined, { name: undefined, storage })
    } else {
        if (!Object.keys(storage).length)
            throw new Error('[nuxt-files-sdk:invalid-config] At least one storage is required.')
        for (const [name, value] of Object.entries(storage)) {
            if (!isStorage(value)) throw new Error(`[nuxt-files-sdk:invalid-config] Invalid storage "${name}".`)
            entries.set(name, { name, storage: value })
        }
    }
    return entries
}
