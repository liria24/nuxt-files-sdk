import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { FilesError } from 'files-sdk'
import { fs } from 'files-sdk/fs'
import { versioning } from 'files-sdk/versioning'
import { afterAll, describe, expect, test, vi } from 'vitest'

import { defineFilesConfig } from '../../packages/nuxt-files-sdk/src/config'
import { configureFiles, useServerFiles } from '../../packages/nuxt-files-sdk/src/runtime'
import { FilesRegistry, type FilesProviderFactories } from '../../packages/nuxt-files-sdk/src/runtime/registry'

const factories: FilesProviderFactories = { fs }
afterAll(async () => {
    for (const name of ['test-files', 'test-archive']) {
        await rm(resolve('.data', name), { recursive: true, force: true })
    }
})

describe('FilesRegistry', () => {
    test('[ERR-001] exposes stable invalid, unknown, and required-name error codes', () => {
        expect(() => new FilesRegistry({ storage: {} }, { factories })).toThrow('[nuxt-files-sdk:invalid-config]')
        const registry = new FilesRegistry(
            {
                storage: {
                    archive: { adapter: 'fs', config: { root: '.data/test-archive' } },
                    blob: { adapter: 'fs', config: { root: '.data/test-files' } },
                },
            },
            { factories },
        )
        expect(() => registry.get('missing' as 'blob')).toThrow(
            '[nuxt-files-sdk:unknown-storage] Unknown storage "missing"',
        )
        expect(() => (registry.get as unknown as () => unknown)()).toThrow('[nuxt-files-sdk:storage-name-required]')
        for (const name of ['toString', '__proto__']) {
            expect(() => registry.get(name as 'blob')).toThrow('[nuxt-files-sdk:unknown-storage]')
        }
    })

    test('[CFG-003][ERR-002] preserves factory errors and never uses devStorage as a production fallback', () => {
        const failure = new FilesError('Provider', 'Missing provider configuration')
        const registry = new FilesRegistry(
            defineFilesConfig({
                storage: { adapter: 's3', config: { bucket: 'missing' } },
                devStorage: { adapter: 'fs', config: { root: '.data/test-files' } },
            }),
            {
                factories: {
                    s3: () => {
                        throw failure
                    },
                    fs,
                },
            },
        )
        expect(() => registry.get()).toThrow(failure)
    })

    test('[CFG-004] preserves plugins and hooks with a development provider override', async () => {
        const onAction = vi.fn<(event: unknown) => void>()
        const files = new FilesRegistry(
            defineFilesConfig({
                storage: {
                    adapter: 's3',
                    config: { bucket: 'unused' },
                    plugins: [versioning()],
                    hooks: { onAction },
                },
                devStorage: { adapter: 'fs', config: { root: '.data/test-files' } },
            }),
            { development: true, factories },
        ).get()

        expect(files.versions).toBeTypeOf('function')
        await files.upload('plugin-contract.txt', 'hello')
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'upload' }))
    })

    test('[SEC-002] reports only a secret-free development snapshot', () => {
        const secret = 'NUXT_FILES_TEST_SECRET_123456'
        const registry = new FilesRegistry(
            defineFilesConfig({
                storage: {
                    adapter: 's3',
                    config: { bucket: 'secret-bucket', secretAccessKey: secret },
                    plugins: [versioning()],
                },
                devStorage: { adapter: 'fs', config: { root: '.data/test-files' } },
            }),
            { development: true, factories },
        )
        expect(registry.get()).toBe(registry.get())

        expect(registry.inspect()).toEqual({
            storages: [
                {
                    adapter: 'fs',
                    plugins: ['versioning'],
                    source: 'devStorage',
                    initialized: true,
                },
            ],
            diagnostics: [],
        })
        expect(JSON.stringify(registry.inspect())).not.toMatch(/secret-bucket|NUXT_FILES_TEST_SECRET_123456/)
    })

    test('[CFG-002] unnamed access is exclusive to a single storage', () => {
        const single = new FilesRegistry(
            { storage: { adapter: 'fs', config: { root: '.data/test-files' } } },
            { factories },
        )
        expect(single.get()).toMatchObject({ adapter: { name: 'fs' } })

        const named = new FilesRegistry(
            {
                storage: {
                    archive: { adapter: 'fs', config: { root: '.data/test-archive' } },
                    blob: { adapter: 'fs', config: { root: '.data/test-files' } },
                },
            },
            { factories },
        )
        expect(() => (named.get as unknown as () => unknown)()).toThrow('storage-name-required')
    })

    test('[API-001][RUNTIME-001] public access is synchronous and memoized', () => {
        configureFiles({ storage: { adapter: 'fs', config: { root: '.data/test-files' } } }, { factories })
        const first = useServerFiles()
        expect(first).not.toBeInstanceOf(Promise)
        expect(first).toBe(useServerFiles())
    })

    test('[RUNTIME-002] named storages initialize independently', () => {
        const registry = new FilesRegistry(
            {
                storage: {
                    archive: { adapter: 'fs', config: { root: '.data/test-archive' } },
                    blob: { adapter: 'fs', config: { root: '.data/test-files' } },
                },
            },
            { factories },
        )
        expect(registry.get('archive')).not.toBe(registry.get('blob'))
        expect(registry.get('archive')).toBe(registry.get('archive'))
    })

    test('[RUNTIME-003] a construction failure is retried', () => {
        let attempts = 0
        const registry = new FilesRegistry(
            { storage: { adapter: 'fs', config: { root: '.data/test-files' } } },
            {
                factories: {
                    fs: (config) => {
                        attempts += 1
                        if (attempts === 1) throw new FilesError('Provider', 'first attempt failed')
                        return fs({ root: (config as { root: string }).root })
                    },
                },
            },
        )
        expect(() => registry.get()).toThrow('first attempt failed')
        expect(registry.get()).toMatchObject({ adapter: { name: 'fs' } })
        expect(attempts).toBe(2)
    })

    test('[RUNTIME-004] rejects async and circular config resolution', () => {
        const asyncRegistry = new FilesRegistry(
            { storage: { adapter: 'fs', config: (() => Promise.resolve({ root: '.data/test-files' })) as never } },
            { factories },
        )
        expect(() => asyncRegistry.get()).toThrow('[nuxt-files-sdk:async-config]')

        let circular!: FilesRegistry
        circular = new FilesRegistry(
            { storage: { adapter: 'fs', config: () => (circular.get(), { root: '.data/test-files' }) } },
            { factories },
        )
        expect(() => circular.get()).toThrow('[nuxt-files-sdk:circular-initialization]')
    })

    test('[HOOK-001] runs user then bridge hooks without changing operation results', async () => {
        const order: string[] = []
        const bridgeCalled = Promise.withResolvers<void>()
        const files = new FilesRegistry(
            {
                storage: {
                    adapter: 'fs',
                    config: { root: '.data/test-files' },
                    hooks: {
                        onAction: async () => {
                            order.push('user')
                            throw new Error('ignored user hook failure')
                        },
                    },
                },
            },
            {
                factories,
                hooks: {
                    onAction: async (_event, storage) => {
                        expect(storage).toBeUndefined()
                        order.push('bridge')
                        bridgeCalled.resolve()
                        throw new Error('ignored bridge hook failure')
                    },
                },
            },
        ).get()

        await expect(files.upload('hook-contract.txt', 'hello')).resolves.toMatchObject({ key: 'hook-contract.txt' })
        await bridgeCalled.promise
        expect(order).toEqual(['user', 'bridge'])
    })
})
