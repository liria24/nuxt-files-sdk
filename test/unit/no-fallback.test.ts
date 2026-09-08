import { createFiles, FilesError } from 'files-sdk'
import { fs } from 'files-sdk/fs'
import { loadFiles } from 'files-sdk/loader'
import { afterEach, expect, test, vi } from 'vitest'

import { FilesRegistry } from '../../packages/nuxt-files-sdk/src/runtime/registry'

vi.mock('files-sdk/loader', () => ({ loadFiles: vi.fn<typeof loadFiles>() }))
afterEach(() => {
    vi.restoreAllMocks()
    vi.mocked(loadFiles).mockReset()
})

test('[CFG-008] rejects unknown config storage references before provider initialization', () => {
    expect(
        () =>
            new FilesRegistry({
                default: 'missing',
                storage: { blob: { adapter: 's3' } },
            }),
    ).toThrow('[nuxt-files-sdk:unknown-storage] Unknown storage "missing"')
    expect(
        () =>
            new FilesRegistry({
                storage: { blob: { adapter: 's3' } },
                devStorage: { missing: { adapter: 'fs' } },
            }),
    ).toThrow('[nuxt-files-sdk:unknown-storage] Unknown storage "missing"')
    expect(loadFiles).not.toHaveBeenCalled()
})

test('[CFG-006][ERR-002] failed provider initialization makes no HTTP or alternate-provider attempt', async () => {
    const failure = new FilesError('Provider', 'Missing provider configuration')
    vi.mocked(loadFiles).mockRejectedValue(failure)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'))
    const registry = new FilesRegistry({
        storage: { blob: { adapter: 's3' } },
        devStorage: { blob: { adapter: 'fs' } },
    })
    await expect(registry.get('blob')).rejects.toBe(failure)
    expect(loadFiles).toHaveBeenCalledExactlyOnceWith({ provider: 's3' })
    expect(fetchSpy).not.toHaveBeenCalled()
})

test('[CFG-007][ERR-002] native operation failures never switch storage or wrap the error', async () => {
    const failure = new FilesError('Unauthorized', 'Provider denied the operation')
    const files = createFiles({ adapter: fs({ root: '.data/unused' }) })
    vi.spyOn(files, 'upload').mockRejectedValue(failure)
    vi.mocked(loadFiles).mockResolvedValue({ files, provider: 's3' })
    const registry = new FilesRegistry({
        storage: { blob: { adapter: 's3' }, backup: { adapter: 'fs' } },
    })
    const resolved = await registry.get('blob')
    await expect(resolved.upload('contract.txt', 'data')).rejects.toBe(failure)
    expect(loadFiles).toHaveBeenCalledExactlyOnceWith({ provider: 's3' })
})
