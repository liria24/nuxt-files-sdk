import { fs } from 'files-sdk/fs'
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
