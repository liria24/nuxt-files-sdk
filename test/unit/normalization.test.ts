import { memory } from 'files-sdk/memory'
import { describe, expect, test, vi } from 'vitest'

import type { FilesConfig, StorageConfig } from '../../packages/nuxt-files-sdk/src/config'
import { selectedAdapters } from '../../packages/nuxt-files-sdk/src/integration/nitro'
import * as runtime from '../../packages/nuxt-files-sdk/src/runtime'
import { FilesRegistry } from '../../packages/nuxt-files-sdk/src/runtime/registry'

describe('normalized configuration', () => {
    test('[CFG-013] preparation and runtime reject the same invalid structure', () => {
        for (const config of [
            null,
            [],
            { storage: {} },
            { storage: [] },
            { storage: { adapter: 'memory' }, devStorage: { named: { adapter: 'memory' } } },
            { storage: { named: { adapter: 'memory' } }, devStorage: { adapter: 'memory' } },
            { storage: { named: { adapter: 'memory' } }, devStorage: { missing: { adapter: 'memory' } } },
        ]) {
            for (const development of [true, false]) {
                let error: unknown
                try {
                    selectedAdapters(config, development)
                } catch (failure) {
                    error = failure
                }
                expect(error).toBeInstanceOf(Error)
                expect(() => new FilesRegistry(config as FilesConfig, { development, factories: { memory } })).toThrow(
                    error,
                )
            }
        }
        const config = { default: 'unused', storage: { adapter: 'memory' as const } }
        expect(selectedAdapters(config, false)).toEqual({ single: true, adapters: ['memory'] })
        expect(new FilesRegistry(config, { factories: { memory } }).get().adapter.name).toBe('memory')
    })

    test('[RUNTIME-005] resolves cached entries without reading configuration again', () => {
        const enumerate = vi.fn<() => string[]>(() => Reflect.ownKeys(storages) as string[])
        const resolver = vi.fn<() => object>(() => ({}))
        const storages: Record<string, StorageConfig> = Object.fromEntries(
            Array.from({ length: 1000 }, (_, index) => [`storage${index}`, { adapter: 'memory', config: resolver }]),
        )
        const registry = new FilesRegistry(
            { storage: new Proxy(storages, { ownKeys: enumerate }) },
            { factories: { memory } },
        )
        expect(resolver).not.toHaveBeenCalled()
        enumerate.mockClear()
        const first = registry.get('storage999')
        for (let index = 0; index < 100; index++) expect(registry.get('storage999')).toBe(first)
        expect(enumerate).not.toHaveBeenCalled()
        expect(resolver).toHaveBeenCalledTimes(1)
        storages.storage999 = { adapter: 'fs', config: { root: '.data/unused' } }
        expect(registry.inspect().storages.at(-1)?.adapter).toBe('memory')
    })

    test('[API-004] runtime exports only the public accessor', () => {
        expect(Object.keys(runtime)).toEqual(['useServerFiles', 'syncFiles', 'transferFiles'])
    })
})
