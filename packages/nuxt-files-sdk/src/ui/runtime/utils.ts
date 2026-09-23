import type { StoredFile } from 'files-sdk'
import type { FilesClient } from 'files-sdk/client'

export const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)))

export const createLatestRequest = () => {
    let active: AbortController | undefined
    return {
        next: () => {
            active?.abort()
            return (active = new AbortController())
        },
        current: (request: AbortController) => active === request && !request.signal.aborted,
        abort: () => active?.abort(),
    }
}

export const downloadFile = async (files: FilesClient, key: string): Promise<void> => {
    const file = await files.download(key)
    const url = URL.createObjectURL(await file.blob())
    const anchor = document.createElement('a')
    anchor.download = key.split('/').pop() ?? key
    anchor.href = url
    anchor.click()
    URL.revokeObjectURL(url)
}

export const parentOf = (key: string): string => {
    const slash = key.lastIndexOf('/')
    return slash === -1 ? '' : key.slice(0, slash + 1)
}

export const proxyUrl = (endpoint: string, key: string): string =>
    `${endpoint}${endpoint.includes('?') ? '&' : '?'}op=download&key=${encodeURIComponent(key)}`

export const isStoredFile = (file: StoredFile | string): file is StoredFile => typeof file !== 'string'
