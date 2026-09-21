import { fs } from 'files-sdk/fs'
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
    test('[TYPE-001][TYPE-013][API-002][API-003] preserves single, named, provider, and plugin types', () => {
        const single = defineFilesConfig({
            storage: { adapter: 'fs', config: { root: '.data/files' }, plugins: [versioning()] },
        })
        const named = defineFilesConfig({
            storage: {
                archive: { adapter: 'fs', config: { root: '.data/archive' }, plugins: [versioning()] },
                blob: { adapter: 'fs', config: { root: '.data/files' } },
            },
        })
        const developmentOnly = defineFilesConfig({
            devStorage: { adapter: 'fs', config: { root: '.data/development' }, plugins: [versioning()] },
        })
        const namedDevelopmentOnly = defineFilesConfig({
            devStorage: {
                archive: { adapter: 'fs', config: { root: '.data/development-archive' } },
                blob: { adapter: 'fs', config: { root: '.data/development' } },
            },
        })

        expect(single.storage.config.root).toBe('.data/files')
        expectTypeOf<SingleStorage<typeof single>>().toHaveProperty('versions')
        expectTypeOf<SingleStorage<typeof developmentOnly>>().toHaveProperty('versions')
        expectTypeOf<StorageRegistry<typeof namedDevelopmentOnly>>().toHaveProperty('archive')
        expectTypeOf<StorageRegistry<typeof named>['archive']>().toHaveProperty('versions')
        expectTypeOf(new FilesRegistry(single, { factories: { fs } }).get()).toEqualTypeOf<
            SingleStorage<typeof single>
        >()
        const namedRegistry = new FilesRegistry(named, { factories: { fs } })
        expectTypeOf(namedRegistry.get('blob')).toEqualTypeOf<StorageRegistry<typeof named>['blob']>()
        const assertNamedRequiresName = (): void => {
            // @ts-expect-error named registries require a storage name
            namedRegistry.get()
        }
        void assertNamedRequiresName
    })

    test('[CFG-005] accepts provider config objects and synchronous resolvers', () => {
        const direct = defineFilesConfig({ storage: { adapter: 'fs', config: { root: '.data/files' } } })
        const resolved = defineFilesConfig({
            storage: { adapter: 'fs', config: () => ({ root: '.data/files', urlBaseUrl: 'https://files.test' }) },
            devStorage: { adapter: 'memory' },
        })

        expect(direct.storage.adapter).toBe('fs')
        expect(typeof resolved.storage.config).toBe('function')
    })

    test('[TYPE-014] preserves RustFS, native common options, and provider raw types', () => {
        const controller = new AbortController()
        const rustfs = defineFilesConfig({
            storage: {
                adapter: 'rustfs',
                config: { bucket: 'files', endpoint: 'http://localhost:9000', client: 'fetch' },
                prefix: 'uploads',
                readonly: true,
                receipts: { sha256: true },
                retries: { max: 2, backoff: () => 0 },
                signal: controller.signal,
                timeout: 1000,
            },
        })

        expect(rustfs.storage.adapter).toBe('rustfs')
        expectTypeOf<SingleStorage<typeof rustfs>['adapter']>().toEqualTypeOf<RustfsAdapter>()
    })

    test('[CFG-011] strips a development-only storage safely in production', () => {
        const nodeEnvironment = process.env.NODE_ENV
        process.env.NODE_ENV = 'production'
        try {
            expect(defineFilesConfig({ devStorage: { adapter: 'memory' } })).toEqual({ storage: undefined })
        } finally {
            if (nodeEnvironment === undefined) delete process.env.NODE_ENV
            else process.env.NODE_ENV = nodeEnvironment
        }
    })

    test('[TYPE-008] rejects unmatched development names', () => {
        expect.assertions(0)
        defineFilesConfig({
            // @ts-expect-error devStorage keys must name a declared storage
            storage: { blob: { adapter: 'fs', config: { root: '.data/files' } } },
            devStorage: {
                missing: { adapter: 'fs', config: { root: '.data/missing' } },
            },
        })
    })
})
