import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { FilesError } from 'files-sdk'
import { failover } from 'files-sdk/failover'
import { fs } from 'files-sdk/fs'
import { memory } from 'files-sdk/memory'
import { tiering } from 'files-sdk/tiering'
import { versioning } from 'files-sdk/versioning'
import { afterAll, describe, expect, test, vi } from 'vitest'

import { defineFilesConfig, type FilesPluginContext } from '../../packages/nuxt-files-sdk/src/config'
import { syncFiles, transferFiles, useServerFiles } from '../../packages/nuxt-files-sdk/src/runtime'
import { configureFiles } from '../../packages/nuxt-files-sdk/src/runtime/internal'
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

    test('[CFG-012] passes native constructor options through unchanged', async () => {
        const signal = new AbortController().signal
        const files = new FilesRegistry(
            defineFilesConfig({
                storage: {
                    adapter: 'fs',
                    config: { root: '.data/test-files' },
                    prefix: 'native-options',
                    receipts: true,
                    retries: { max: 2, backoff: () => 0 },
                    signal,
                    timeout: 250,
                },
            }),
            { factories },
        ).get()

        expect(files.prefix).toBe('native-options')
        expect(files.defaults).toEqual({ retries: { max: 2, backoff: expect.any(Function) }, signal, timeout: 250 })
        await expect(files.upload('passthrough.txt', 'hello')).resolves.toMatchObject({ key: 'passthrough.txt' })

        const readonly = new FilesRegistry(
            defineFilesConfig({
                storage: { adapter: 'fs', config: { root: '.data/test-files' }, readonly: true },
            }),
            { factories },
        ).get()
        await expect(readonly.upload('readonly.txt', 'blocked')).rejects.toMatchObject({ code: 'ReadOnly' })
    })

    test('[CFG-011] supports a complete development-only storage', () => {
        const registry = new FilesRegistry(
            defineFilesConfig({
                devStorage: {
                    adapter: 'fs',
                    config: { root: '.data/test-files' },
                    plugins: [versioning()],
                },
            }),
            { development: true, factories },
        )

        expect(registry.get().versions).toBeTypeOf('function')
        expect(registry.inspect().storages).toEqual([
            { adapter: 'fs', plugins: ['versioning'], source: 'devStorage', initialized: true },
        ])
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

    test('custom adapters and composition resolve adapters lazily before Files clients', async () => {
        const cold = vi.fn<() => ReturnType<typeof memory>>(() => memory())
        const hot = vi.fn<() => ReturnType<typeof memory>>(() => memory())
        let resolverCalls = 0
        const registry = new FilesRegistry(
            defineFilesConfig({
                storage: {
                    archive: { adapter: cold },
                    backup: { adapter: () => memory() },
                    uploads: {
                        adapter: hot,
                        plugins: ({ storage }) => {
                            resolverCalls++
                            return [
                                versioning(),
                                tiering({
                                    cold: storage('archive'),
                                    route: ({ key }) => (key.startsWith('archive/') ? 'cold' : 'hot'),
                                }),
                                failover({ secondaries: storage('backup') }),
                            ] as const
                        },
                    },
                },
                devStorage: { uploads: { adapter: () => memory() } },
            }),
            { development: true, factories: {} },
        )
        expect([cold, hot].map((fn) => fn.mock.calls.length)).toEqual([0, 0])
        expect(resolverCalls).toBe(0)
        const files = registry.get('uploads')
        expect(files.versions).toBeTypeOf('function')
        expect(files.tierOf).toBeTypeOf('function')
        expect(registry.inspect().storages.map(({ initialized }) => initialized)).toEqual([false, false, true])
        expect(registry.inspect().storages[2]?.plugins).toEqual(['versioning', 'tiering', 'failover'])
        expect(cold).toHaveBeenCalledOnce()
        expect(hot).not.toHaveBeenCalled()
        expect(resolverCalls).toBe(1)
        await files.upload('archive/old.txt', 'hello')
        expect(await files.exists('archive/old.txt')).toBe(true)
    })

    test('detects a cross-storage adapter dependency cycle', () => {
        let registry!: FilesRegistry
        registry = new FilesRegistry(
            {
                storage: {
                    first: { adapter: () => (registry.resolveAdapter('second'), memory()) },
                    second: { adapter: () => (registry.resolveAdapter('first'), memory()) },
                },
            },
            { factories: {} },
        )
        expect(() => registry.resolveAdapter('first')).toThrow('[nuxt-files-sdk:circular-initialization]')
    })

    test('detects a plugin resolver cycle through another storage', () => {
        let registry!: FilesRegistry
        registry = new FilesRegistry(
            {
                storage: {
                    uploads: {
                        adapter: () => memory(),
                        plugins: ({ storage }: FilesPluginContext) => [failover({ secondaries: storage('archive') })],
                    },
                    archive: { adapter: () => (registry.get('uploads' as never), memory()) },
                },
            },
            { factories: {} },
        )
        expect(() => registry.get('uploads' as never)).toThrow('[nuxt-files-sdk:circular-initialization]')
    })

    test('delegates sync and transfer between names and native Files instances', async () => {
        const registry = configureFiles(
            { storage: { source: { adapter: 'memory' }, destination: { adapter: 'memory' } } },
            { factories: { memory } },
        )
        await registry.get('source').upload('one.txt', 'one')
        expect(await syncFiles(registry.get('source'), 'destination' as never, { compare: 'size' })).toMatchObject({
            uploaded: ['one.txt'],
        })
        expect(await transferFiles(registry.get('source'), 'destination' as never, { overwrite: false })).toMatchObject(
            { skipped: ['one.txt'] },
        )
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
        expect(registry.inspect().diagnostics).toEqual([
            expect.objectContaining({ code: 'NUXT_FILES_ADAPTER_INIT_FAILED', adapter: 'fs' }),
        ])
        expect(registry.get()).toMatchObject({ adapter: { name: 'fs' } })
        expect(registry.inspect().diagnostics).toEqual([])
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
