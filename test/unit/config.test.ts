import { versioning } from 'files-sdk/versioning'
import { describe, expect, expectTypeOf, test } from 'vitest'

import { defineFilesConfig } from '../../packages/nuxt-files-sdk/src/config'
import {
    type DefaultStorage,
    type DefaultStorageName,
    FilesRegistry,
} from '../../packages/nuxt-files-sdk/src/runtime/registry'

describe('configuration types', () => {
    test('[TYPE-001][API-002][API-003] preserves provider, named/default storage, and plugin types', () => {
        const config = defineFilesConfig({
            default: 'archive',
            storage: {
                archive: { adapter: 'fs', plugins: [versioning()] },
                blob: { adapter: 'fs' },
            },
        })

        expect(config.storage.blob.adapter).toBe('fs')
        expectTypeOf<DefaultStorageName<typeof config>>().toEqualTypeOf<'archive'>()
        expectTypeOf<DefaultStorage<typeof config>>().toHaveProperty('versions')
        expectTypeOf(new FilesRegistry(config).get()).toEqualTypeOf<Promise<DefaultStorage<typeof config>>>()
    })

    test('[CFG-005] infers only unambiguous implicit defaults', () => {
        const single = defineFilesConfig({ storage: { blob: { adapter: 'fs' } } })
        const conventional = defineFilesConfig({
            storage: { default: { adapter: 'fs' }, blob: { adapter: 'fs' } },
        })
        const ambiguous = defineFilesConfig({
            storage: { archive: { adapter: 'fs' }, blob: { adapter: 'fs' } },
        })

        expectTypeOf<DefaultStorageName<typeof single>>().toEqualTypeOf<'blob'>()
        expectTypeOf<DefaultStorageName<typeof conventional>>().toEqualTypeOf<'default'>()
        expectTypeOf<DefaultStorageName<typeof ambiguous>>().toEqualTypeOf<never>()
    })

    test('[TYPE-007][TYPE-008] constrains default and devStorage to declared storage names', () => {
        expect.assertions(0)
        defineFilesConfig({
            // @ts-expect-error default must name a declared storage
            default: 'missing',
            storage: { blob: { adapter: 'fs' } },
        })
        defineFilesConfig({
            storage: { blob: { adapter: 'fs' } },
            devStorage: {
                // @ts-expect-error devStorage keys must name declared storages
                missing: { adapter: 'fs' },
            },
        })
    })
})
