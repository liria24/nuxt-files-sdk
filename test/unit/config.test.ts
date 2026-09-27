import { fs } from 'files-sdk/fs'
import type { FsAdapter } from 'files-sdk/fs'
import type { MemoryAdapter } from 'files-sdk/memory'
import type { R2Adapter } from 'files-sdk/r2'
import type { RustfsAdapter } from 'files-sdk/rustfs'
import { versioning } from 'files-sdk/versioning'
import { describe, expect, expectTypeOf, test } from 'vitest'

import { defineFilesConfig } from '../../packages/nuxt-files-sdk/src/config'
import {
    FilesRegistry,
    type SingleStorage,
    type StorageRegistry,
} from '../../packages/nuxt-files-sdk/src/runtime/registry'

describe('configuration types', () => {
    test('[TYPE-001][TYPE-013] unions adapters and retains base plugins across every environment', () => {
        const single = defineFilesConfig({
            storage: { adapter: 'r2', config: { bucket: 'files' }, plugins: [versioning()] },
            $development: { storage: { adapter: 'fs', config: { root: '.' } } },
            $production: { storage: { adapter: 'r2', config: { bucket: 'production' } } },
            $test: { storage: { adapter: 'memory' } },
            $prerender: { storage: { adapter: 'fs', config: { root: 'dist' } } },
            $env: { preview: { storage: { adapter: 'memory' } } },
        })
        expectTypeOf<SingleStorage<typeof single>['adapter']>().toEqualTypeOf<R2Adapter | FsAdapter | MemoryAdapter>()
        expectTypeOf<SingleStorage<typeof single>>().toHaveProperty('versions')
        expect(single.$env.preview.storage.adapter).toBe('memory')
    })

    test('[TYPE-001][API-002][API-003] unions named and environment-only storages', () => {
        const named = defineFilesConfig({
            storage: {
                archive: { adapter: 'fs', config: { root: 'archive' }, plugins: [versioning()] },
                blob: { adapter: 'memory' },
            },
            $development: { storage: { archive: { adapter: 'memory' }, debug: { adapter: 'memory' } } },
            $env: { staging: { storage: { blob: { adapter: 'fs', config: { root: 'staging' } } } } },
        })
        expectTypeOf<StorageRegistry<typeof named>['archive']['adapter']>().toEqualTypeOf<FsAdapter | MemoryAdapter>()
        expectTypeOf<StorageRegistry<typeof named>['blob']['adapter']>().toEqualTypeOf<MemoryAdapter | FsAdapter>()
        expectTypeOf<StorageRegistry<typeof named>>().toHaveProperty('debug')
        expectTypeOf<StorageRegistry<typeof named>['archive']>().toHaveProperty('versions')
        const registry = new FilesRegistry({ storage: named.storage }, { factories: { fs } })
        const requiresName = (): void => {
            // @ts-expect-error named registries require a storage name
            registry.get()
        }
        void requiresName
        const only = defineFilesConfig({ $test: { storage: { adapter: 'memory' } } })
        expectTypeOf<SingleStorage<typeof only>['adapter']>().toEqualTypeOf<MemoryAdapter>()
    })

    test('[CFG-005][GATEWAY-003] is a pure identity helper with lazy resolvers and routes', () => {
        const config = defineFilesConfig({
            storage: { adapter: 'fs', config: () => ({ root: '.data/files' }) },
            routes: [{ path: '/api/files', operations: ['list'] }],
            $development: { routes: [{ path: '/api/files', operations: ['list', 'upload'] }] },
        })
        expect(config.storage.adapter).toBe('fs')
        expect(typeof config.storage.config).toBe('function')
        expect(config.$development.routes).toHaveLength(1)
    })

    test('[TYPE-014] preserves RustFS and native common options', () => {
        const rustfs = defineFilesConfig({
            storage: {
                adapter: 'rustfs',
                config: { bucket: 'files', endpoint: 'http://localhost:9000', client: 'fetch' },
                prefix: 'uploads',
                readonly: true,
                receipts: { sha256: true },
                retries: { max: 2, backoff: () => 0 },
            },
        })
        expectTypeOf<SingleStorage<typeof rustfs>['adapter']>().toEqualTypeOf<RustfsAdapter>()
        expect(rustfs.storage.prefix).toBe('uploads')
    })

    test('[CFG-011][TYPE-008] permits environment-only named storage', () => {
        const config = defineFilesConfig({ $test: { storage: { debug: { adapter: 'memory' } } } })
        expectTypeOf<StorageRegistry<typeof config>>().toHaveProperty('debug')
        expect(config.$test.storage.debug.adapter).toBe('memory')
    })
})
