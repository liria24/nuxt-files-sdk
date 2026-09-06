import { FilesError, type ProviderSlug } from 'files-sdk'
import { versioning } from 'files-sdk/versioning'
import { afterAll, describe, expect, test, vi } from 'vitest'

import { defineFilesConfig } from '../../packages/nuxt-files-sdk/src/config'
import { configureFiles, useServerFiles } from '../../packages/nuxt-files-sdk/src/runtime'
import { FilesRegistry } from '../../packages/nuxt-files-sdk/src/runtime/registry'

const invalidProvider = 'not-a-provider' as ProviderSlug

afterAll(async () => {
    for (const name of ['test-files', 'test-archive']) {
        await rm(resolve('.data', name), { recursive: true, force: true })
    }
})

describe('FilesRegistry', () => {
    test('[ERR-001] exposes stable invalid, unknown, and required-name error codes', () => {
        expect(() => new FilesRegistry({ storage: {} })).toThrow('[nuxt-files-sdk:invalid-config]')
        const registry = new FilesRegistry({
            storage: {
                archive: { adapter: 'fs' },
                blob: { adapter: 'fs' },
            },
        })
        expect(() => registry.get('missing' as 'blob')).toThrow(
            '[nuxt-files-sdk:unknown-storage] Unknown storage "missing"',
        )
        expect(() => registry.get()).toThrow('[nuxt-files-sdk:storage-name-required]')
        for (const name of ['toString', '__proto__']) {
            expect(() => registry.get(name as 'blob')).toThrow('[nuxt-files-sdk:unknown-storage]')
        }
    })

    test('[CFG-003][ERR-002] preserves native errors and never uses devStorage as a production fallback', async () => {
        const registry = new FilesRegistry(
            defineFilesConfig({
                storage: { blob: { adapter: invalidProvider } },
                devStorage: { blob: { adapter: 'fs', root: '.data/test-files' } },
            }),
        )
        await expect(registry.get('blob')).rejects.toBeInstanceOf(FilesError)
        await expect(registry.get('blob')).rejects.toMatchObject({ code: 'Provider' })
    })

    test('[CFG-004] preserves logical plugins and hooks with a development connection override', async () => {
        const onAction = vi.fn<(event: unknown) => void>()
        const files = await new FilesRegistry(
            defineFilesConfig({
                storage: {
                    blob: {
                        adapter: invalidProvider,
                        plugins: [versioning()],
                        hooks: { onAction },
                    },
                },
                devStorage: { blob: { adapter: 'fs', root: '.data/test-files' } },
            }),
            { development: true },
        ).get('blob')

        expect(files.versions).toBeTypeOf('function')
        await files.upload('plugin-contract.txt', 'hello')
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'upload' }))
    })

    test('[SEC-002] reports only a secret-free development snapshot', async () => {
        const secret = 'NUXT_FILES_TEST_SECRET_123456'
        const registry = new FilesRegistry(
            defineFilesConfig({
                storage: {
                    blob: {
                        adapter: 's3',
                        bucket: 'secret-bucket',
                        secretAccessKey: secret,
                        plugins: [versioning()],
                    },
                },
                devStorage: { blob: { adapter: 'fs', root: '.data/test-files' } },
            }),
            { development: true },
        )
        const first = registry.get('blob')
        expect(first).toBe(registry.get('blob'))
        await first

        expect(registry.inspect()).toEqual({
            storages: [
                {
                    name: 'blob',
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

    test('[CFG-002] uses explicit defaults and rejects ambiguous unnamed access', async () => {
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

    test('[API-001] public useServerFiles returns the memoized promise', async () => {
        configureFiles({ storage: { blob: { adapter: 'fs', root: '.data/test-files' } } })
        const first = useServerFiles()
        expect(first).toBeInstanceOf(Promise)
        await expect(first).resolves.toBe(await useServerFiles())
    })

    test('[RUNTIME-001] initializes one instance for 100 concurrent same-storage calls', async () => {
        const extend = vi.fn<() => Record<never, never>>(() => ({}))
        const registry = new FilesRegistry({
            storage: { blob: { adapter: 'fs', root: '.data/test-files', plugins: [{ name: 'counter', extend }] } },
        })
        const instances = await Promise.all(Array.from({ length: 100 }, () => registry.get('blob')))
        expect(new Set(instances)).toHaveLength(1)
        expect(extend).toHaveBeenCalledTimes(1)
    })

    test('[RUNTIME-002] isolates concurrent storage initialization and failures', async () => {
        const registry = new FilesRegistry({
            storage: {
                archive: { adapter: 'fs', root: '.data/test-archive' },
                backup: { adapter: invalidProvider },
                blob: { adapter: 'fs', root: '.data/test-files' },
            },
        })
        const [archive, backup, blob] = await Promise.allSettled([
            registry.get('archive'),
            registry.get('backup'),
            registry.get('blob'),
        ])
        expect(archive.status).toBe('fulfilled')
        expect(backup.status).toBe('rejected')
        expect(blob.status).toBe('fulfilled')
        await expect(registry.get('archive')).resolves.not.toBe(await registry.get('blob'))
    })

    test('[RUNTIME-003] evicts a rejected initialization so a later call can retry', async () => {
        const config = { storage: { blob: { adapter: invalidProvider, root: '.data/test-files' } } }
        const registry = new FilesRegistry(config)
        await expect(registry.get('blob')).rejects.toBeInstanceOf(FilesError)
        config.storage.blob.adapter = 'fs'
        await expect(registry.get('blob')).resolves.toMatchObject({ adapter: { name: 'fs' } })
    })

    test('[HOOK-001] runs user then bridge hooks without changing operation results', async () => {
        const order: string[] = []
        const bridgeCalled = Promise.withResolvers<void>()
        const files = await new FilesRegistry(
            {
                storage: {
                    blob: {
                        adapter: 'fs',
                        root: '.data/test-files',
                        hooks: {
                            onAction: async () => {
                                order.push('user')
                                throw new Error('ignored user hook failure')
                            },
                        },
                    },
                },
            },
            {
                hooks: {
                    onAction: async () => {
                        order.push('bridge')
                        bridgeCalled.resolve()
                        throw new Error('ignored bridge hook failure')
                    },
                },
            },
        ).get('blob')

        await expect(files.upload('hook-contract.txt', 'hello')).resolves.toMatchObject({ key: 'hook-contract.txt' })
        await bridgeCalled.promise
        expect(order).toEqual(['user', 'bridge'])
    })
})
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
