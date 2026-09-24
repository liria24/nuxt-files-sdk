import type { AdapterCapabilities } from 'files-sdk'
import type { FilesClient } from 'files-sdk/client'
import { describe, expect, test, vi } from 'vitest'

import { FilesBrowser } from '../../packages/nuxt-files-sdk/src/devtools/client/browser'

const client = () => ({
    capabilities: vi.fn<FilesClient['capabilities']>().mockResolvedValue({ delimiter: true } as AdapterCapabilities),
    list: vi.fn<FilesClient['list']>().mockResolvedValue({ items: [] }),
    delete: vi.fn<(key: string) => Promise<void>>().mockResolvedValue(undefined),
})

describe('DevTools file browser', () => {
    test('[DEV-006] stale capabilities, listings, and failures cannot update a different location', async () => {
        const a = client(),
            b = client()
        const capabilities = Promise.withResolvers<AdapterCapabilities>()
        a.capabilities.mockReturnValueOnce(capabilities.promise)
        const browser = new FilesBrowser((name) => (name === 'a' ? a : b) as unknown as FilesClient)
        browser.navigate('a', 'first/')
        const stale = browser.list()
        browser.navigate('b', 'second/')
        expect(a.capabilities.mock.lastCall?.[0]?.signal?.aborted).toBe(true)
        await browser.list()
        capabilities.resolve({ delimiter: false } as AdapterCapabilities)
        expect(await stale).toBeUndefined()
        expect(a.list).not.toHaveBeenCalled()
        browser.navigate('a')
        await browser.list()
        expect(a.capabilities).toHaveBeenCalledTimes(2)
        expect(a.list).toHaveBeenLastCalledWith({
            prefix: '',
            delimiter: '/',
            limit: 1000,
            signal: expect.any(AbortSignal),
        })

        const listing = Promise.withResolvers<Awaited<ReturnType<FilesClient['list']>>>()
        a.list.mockReturnValueOnce(listing.promise)
        const obsolete = browser.list()
        browser.navigate('b')
        expect(a.list.mock.lastCall?.[0]?.signal?.aborted).toBe(true)
        await browser.list()
        listing.resolve({ items: [], cursor: 'obsolete' })
        expect(await obsolete).toBeUndefined()
        expect(browser.hasNext).toBe(false)

        b.list.mockReturnValueOnce(Promise.reject(new Error('stale failure')))
        const failure = browser.list()
        browser.navigate('a')
        expect(await failure).toBeUndefined()
    })

    test('[DEV-007] pages use cursors and reset on navigation, refresh, and writes', async () => {
        const files = client()
        files.list.mockResolvedValue({ items: [], cursor: 'page-2' })
        const browser = new FilesBrowser(() => files as unknown as FilesClient)
        await browser.list()
        expect(browser.hasNext).toBe(true)
        browser.next()
        await browser.list()
        expect(files.list).toHaveBeenLastCalledWith({
            prefix: '',
            delimiter: '/',
            limit: 1000,
            cursor: 'page-2',
            signal: expect.any(AbortSignal),
        })
        expect(browser.hasPrevious).toBe(true)
        browser.previous()
        await browser.list()
        expect(files.list).toHaveBeenLastCalledWith({
            prefix: '',
            delimiter: '/',
            limit: 1000,
            signal: expect.any(AbortSignal),
        })
        expect(files.capabilities).toHaveBeenCalledTimes(1)
        browser.next()
        browser.reset(true)
        await browser.list()
        expect(files.capabilities).toHaveBeenCalledTimes(2)
        expect(browser.hasPrevious).toBe(false)
        browser.next()
        browser.navigate('', 'folder/')
        await browser.list()
        expect(files.list).toHaveBeenLastCalledWith({
            prefix: 'folder/',
            delimiter: '/',
            limit: 1000,
            signal: expect.any(AbortSignal),
        })
        browser.next()
        browser.reset()
        expect(browser.hasPrevious).toBe(false)
    })

    test('[DEV-008] operations keep their client and cannot refresh a newly selected storage', async () => {
        const a = client(),
            b = client()
        const completion = Promise.withResolvers<void>()
        a.delete.mockReturnValueOnce(completion.promise)
        const browser = new FilesBrowser((name) => (name === 'a' ? a : b) as unknown as FilesClient)
        browser.navigate('a', 'uploads/')
        const operation = browser.capture()
        const refresh = vi.fn<() => void>()
        const pending = operation.client.delete(operation.prefix + 'file.txt').then(() => {
            if (operation.current()) refresh()
        })
        browser.navigate('b')
        completion.resolve()
        await pending
        expect(a.delete).toHaveBeenCalledWith('uploads/file.txt')
        expect(b.delete).not.toHaveBeenCalled()
        expect(refresh).not.toHaveBeenCalled()
    })
})
