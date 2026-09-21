import type { Files } from 'files-sdk'
import { createFilesRouter, type FilesOperation } from 'files-sdk/api'
import { createRouteHandler } from 'files-sdk/nitro'

import { useServerFiles } from '../runtime'
import { inspectFiles } from '../runtime/internal'
import { authorizeFilesDevtoolsRequest } from './auth'
import { FILES_DEVTOOLS_MAX_UPLOAD_SIZE } from './snapshot'

const readOperations = ['capabilities', 'list', 'exists', 'download'] as const satisfies readonly FilesOperation[]
const writeOperations = [...readOperations, 'upload', 'delete'] as const satisfies readonly FilesOperation[]
export const filesDevtoolsOperations = (write: boolean): readonly FilesOperation[] =>
    write ? writeOperations : readOperations
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
            operations: filesDevtoolsOperations(write),
            maxUploadSize: FILES_DEVTOOLS_MAX_UPLOAD_SIZE,
            secret: crypto.randomUUID(),
        }),
    )
    return async (event: Parameters<typeof handleFiles>[0], secret: string): Promise<Response> => {
        if (!(await authorizeFilesDevtoolsRequest(event.node.req, secret))) {
            return new Response(null, { status: 401 })
        }
        const url = new URL(event.node.req.url ?? '/', 'http://nuxt-files-sdk.local')
        if (event.node.req.method === 'GET' && url.searchParams.get('op') === 'devtools') {
            return Response.json({ write, maxUploadSize: FILES_DEVTOOLS_MAX_UPLOAD_SIZE })
        }
        return handleFiles(event)
    }
}
