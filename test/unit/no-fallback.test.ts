import { FilesError } from 'files-sdk'
import { fs } from 'files-sdk/fs'
import { afterEach, expect, test, vi } from 'vitest'

import { FilesRegistry } from '../../packages/nuxt-files-sdk/src/runtime/registry'

afterEach(() => vi.restoreAllMocks())

test('[CFG-008] rejects unknown development storage references before provider construction', () => {
    const factory = vi.fn<() => ReturnType<typeof fs>>(() => fs({ root: '.data/unused' }))
    expect(
        () =>
            new FilesRegistry(
                {
                    storage: { blob: { adapter: 'fs', config: { root: '.data/unused' } } },
                    devStorage: { missing: { adapter: 'fs', config: { root: '.data/unused' } } },
                } as never,
                { factories: { fs: factory } },
            ),
    ).toThrow('[nuxt-files-sdk:unknown-storage] Unknown storage "missing"')
    expect(factory).not.toHaveBeenCalled()
})

test('[CFG-006][ERR-002] failed provider construction makes no HTTP or alternate-provider attempt', () => {
    const failure = new FilesError('Provider', 'Missing provider configuration')
    const failing = vi.fn<() => never>(() => {
        throw failure
    })
    const fallback = vi.fn<() => ReturnType<typeof fs>>(() => fs({ root: '.data/unused' }))
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'))
    const registry = new FilesRegistry(
        {
            storage: { adapter: 's3', config: { bucket: 'missing' } },
            devStorage: { adapter: 'fs', config: { root: '.data/unused' } },
        },
        { factories: { s3: failing, fs: fallback } },
    )
    expect(() => registry.get()).toThrow(failure)
    expect(failing).toHaveBeenCalledOnce()
    expect(fallback).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
})

test('[CFG-007][ERR-002] native operation failures never switch storage or wrap the error', async () => {
    const failure = new FilesError('Unauthorized', 'Provider denied the operation')
    const selected = vi.fn<() => ReturnType<typeof fs>>(() => fs({ root: '.data/unused' }))
    const fallback = vi.fn<() => ReturnType<typeof fs>>(() => fs({ root: '.data/unused' }))
    const registry = new FilesRegistry(
        {
            storage: {
                blob: { adapter: 's3', config: { bucket: 'unused' } },
                backup: { adapter: 'fs', config: { root: '.data/unused' } },
            },
        },
        { factories: { s3: selected, fs: fallback } },
    )
    const resolved = registry.get('blob')
    vi.spyOn(resolved, 'upload').mockRejectedValue(failure)
    await expect(resolved.upload('contract.txt', 'data')).rejects.toBe(failure)
    expect(selected).toHaveBeenCalledOnce()
    expect(fallback).not.toHaveBeenCalled()
})
