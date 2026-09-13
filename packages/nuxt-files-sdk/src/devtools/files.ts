import type { Files } from 'files-sdk'
import { createFilesRouter, type FilesOperation } from 'files-sdk/api'
import { createRouteHandler } from 'files-sdk/nitro'

import { inspectFiles, useServerFiles } from '../runtime'

export const FILES_DEVTOOLS_MAX_UPLOAD_SIZE = 10 * 1024 * 1024

const readOperations = ['capabilities', 'list', 'exists', 'download'] as const satisfies readonly FilesOperation[]
const writeOperations = [...readOperations, 'upload', 'delete'] as const satisfies readonly FilesOperation[]
const getFiles: (name?: string) => Files = useServerFiles

const resolveFiles = (request: Request): Files => {
    const requested = new URL(request.url).searchParams.get('storage') ?? undefined
    const storages = inspectFiles().storages
    if (storages.length === 1 && storages[0]?.name === undefined) {
        if (requested !== undefined) throw new Error(`[nuxt-files-sdk:unknown-storage] Unknown storage "${requested}".`)
        return getFiles()
    }
    if (requested === undefined || !storages.some(({ name }) => name === requested)) {
        throw new Error('[nuxt-files-sdk:unknown-storage] Select a configured storage.')
    }
    return getFiles(requested)
}

export const createFilesDevtoolsHandler = (write: boolean) => {
    const handleFiles = createRouteHandler(
        createFilesRouter({
            files: resolveFiles,
            operations: write ? writeOperations : readOperations,
            maxUploadSize: FILES_DEVTOOLS_MAX_UPLOAD_SIZE,
            secret: crypto.randomUUID(),
        }),
    )
    return (event: Parameters<typeof handleFiles>[0]): Promise<Response> => {
        const url = new URL(event.node.req.url ?? '/', 'http://nuxt-files-sdk.local')
        if (event.node.req.method === 'GET' && url.searchParams.get('op') === 'devtools') {
            return Promise.resolve(Response.json({ write, maxUploadSize: FILES_DEVTOOLS_MAX_UPLOAD_SIZE }))
        }
        return handleFiles(event)
    }
}
