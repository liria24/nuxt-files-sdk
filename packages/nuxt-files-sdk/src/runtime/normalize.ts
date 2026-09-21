import type { StorageConfig } from '../config'

export interface StorageEntry {
    name: string | undefined
    storage: StorageConfig
    selected: StorageConfig
    source: 'storage' | 'devStorage'
}

const isStorage = (value: unknown): value is StorageConfig =>
    Boolean(
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        'adapter' in value &&
        typeof value.adapter === 'string',
    )
const isRecord = (value: unknown): value is Record<string, StorageConfig> =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(isStorage))

/** Validate structure without evaluating runtime configuration or constructing providers. */
export const normalizeFilesConfig = (config: unknown, development: boolean): Map<string | undefined, StorageEntry> => {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        throw new Error('[nuxt-files-sdk:invalid-config] Files configuration must be an object.')
    }
    const { storage, devStorage }: { storage?: unknown; devStorage?: unknown } = config
    const entries = new Map<string | undefined, StorageEntry>()
    const add = (name: string | undefined, base: StorageConfig, override?: StorageConfig) => {
        const value = { ...base }
        entries.set(name, {
            name,
            storage: value,
            selected: override ? { ...override } : value,
            source: !storage || override ? 'devStorage' : 'storage',
        })
    }
    if (!storage) {
        if (!development) return entries
        if (isStorage(devStorage)) add(undefined, devStorage)
        else if (isRecord(devStorage) && Object.keys(devStorage).length) {
            for (const [name, value] of Object.entries(devStorage)) add(name, value)
        } else throw new Error('[nuxt-files-sdk:invalid-config] At least one development storage is required.')
    } else if (isStorage(storage)) {
        if (devStorage && !isStorage(devStorage)) {
            throw new Error('[nuxt-files-sdk:invalid-config] A single storage requires a single devStorage override.')
        }
        add(undefined, storage, development && isStorage(devStorage) ? devStorage : undefined)
    } else {
        if (!isRecord(storage) || !Object.keys(storage).length) {
            throw new Error('[nuxt-files-sdk:invalid-config] At least one storage is required.')
        }
        if (devStorage && !isRecord(devStorage)) {
            throw new Error('[nuxt-files-sdk:invalid-config] Named storage requires named devStorage overrides.')
        }
        const overrides = isRecord(devStorage) ? devStorage : undefined
        for (const name of Object.keys(overrides ?? {})) {
            if (!Object.hasOwn(storage, name))
                throw new Error(`[nuxt-files-sdk:unknown-storage] Unknown storage "${name}".`)
        }
        for (const [name, value] of Object.entries(storage)) {
            add(name, value, development && overrides && Object.hasOwn(overrides, name) ? overrides[name] : undefined)
        }
    }
    return entries
}
