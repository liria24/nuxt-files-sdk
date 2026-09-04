import { versioning } from 'files-sdk/versioning'
import { afterEach, describe, expect, expectTypeOf, test, vi } from 'vitest'

import { defineFilesConfig } from '../src/config'
import { FilesRegistry, withNuxtEnvironment } from '../src/runtime/registry'

describe('configuration', () => {
    afterEach(() => {
        delete process.env.NUXT_AWS_ACCESS_KEY_ID
        delete process.env.AWS_ACCESS_KEY_ID
    })

    test('preserves inferred configuration', () => {
        const config = defineFilesConfig({
            storage: { blob: { adapter: 'fs', root: '.data/test-files' } },
        })
        expect(config.storage.blob.adapter).toBe('fs')
    })

    test('rejects an empty registry', () => {
        expect(() => new FilesRegistry({ storage: {} })).toThrow('invalid-config')
    })

    test('never treats devStorage as a production fallback', async () => {
        const registry = new FilesRegistry({
            storage: { blob: { adapter: 'not-a-provider' } },
            devStorage: { blob: { adapter: 'fs', root: '.data/test-files' } },
        })
        await expect(registry.get('blob')).rejects.toThrow('unknown provider')
    })

    test('uses an explicit development override', async () => {
        const registry = new FilesRegistry(
            {
                storage: { blob: { adapter: 'not-a-provider' } },
                devStorage: { blob: { adapter: 'fs', root: '.data/test-files' } },
            },
            { development: true },
        )
        await expect(registry.get('blob')).resolves.toMatchObject({ adapter: { name: 'fs' } })
    })

    test('preserves logical plugins and native hooks with a development adapter override', async () => {
        const onAction = vi.fn<(event: unknown) => void>()
        const files = await new FilesRegistry(
            {
                storage: {
                    blob: { adapter: 'not-a-provider', plugins: [versioning()], hooks: { onAction } },
                },
                devStorage: { blob: { adapter: 'fs', root: '.data/test-files' } },
            },
            { development: true },
        ).get('blob')

        expect(files.versions).toBeTypeOf('function')
        await files.upload('plugin-contract.txt', 'hello')
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'upload' }))
    })

    test('memoizes one lazy native instance per storage', async () => {
        const registry = new FilesRegistry({
            storage: { blob: { adapter: 'fs', root: '.data/test-files' } },
        })
        const first = registry.get('blob')
        const second = registry.get('blob')

        expect(first).toBe(second)
        await expect(first).resolves.toMatchObject({ adapter: { name: 'fs' } })
    })

    test('uses explicit and conventional default storage names', async () => {
        const explicit = new FilesRegistry({
            default: 'archive',
            storage: {
                archive: { adapter: 'fs', root: '.data/test-files' },
                blob: { adapter: 'fs', root: '.data/test-files' },
            },
        })
        await expect(explicit.get()).resolves.toMatchObject({ adapter: { name: 'fs' } })

        const ambiguous = new FilesRegistry({
            storage: {
                archive: { adapter: 'fs', root: '.data/test-files' },
                blob: { adapter: 'fs', root: '.data/test-files' },
            },
        })
        expect(() => ambiguous.get()).toThrow('storage-name-required')
    })

    test('forwards native Files SDK action hooks', async () => {
        const onAction = vi.fn<(event: unknown, storage: string) => void>()
        const files = await new FilesRegistry(
            { storage: { blob: { adapter: 'fs', root: '.data/test-files' } } },
            { hooks: { onAction } },
        ).get('blob')

        await files.upload('hello.txt', 'hello')
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'upload' }), 'blob')
    })

    test('preserves inferred storage names in the registry type', () => {
        const config = defineFilesConfig({
            storage: { blob: { adapter: 'fs', root: '.data/test-files' } },
        })
        const registry = new FilesRegistry(config)
        const get = (name?: 'blob') => registry.get(name)
        expectTypeOf(get).parameter(0).toEqualTypeOf<'blob' | undefined>()
    })

    test('bridges only provider-declared NUXT_ aliases without lasting mutation', async () => {
        process.env.NUXT_AWS_ACCESS_KEY_ID = 'nuxt'
        await withNuxtEnvironment('s3', async () => {
            expect(process.env.AWS_ACCESS_KEY_ID).toBe('nuxt')
        })
        expect(process.env.AWS_ACCESS_KEY_ID).toBeUndefined()

        process.env.AWS_ACCESS_KEY_ID = 'native'
        await withNuxtEnvironment('s3', async () => {
            expect(process.env.AWS_ACCESS_KEY_ID).toBe('native')
        })
        expect(process.env.AWS_ACCESS_KEY_ID).toBe('native')
    })
})
