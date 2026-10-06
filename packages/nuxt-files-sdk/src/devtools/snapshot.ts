import type { RequestEvent } from '@nuxt/schema'

import type { DependencyDiagnostic } from '../integration/diagnostics'
import { inspectFiles } from '../runtime/internal'
import { authorizeFilesDevtoolsRequest } from './auth'
import { createFilesDevtoolsDiagnostic, type FilesDevtoolsDiagnostic } from './diagnostics'

export interface FilesDevtoolsSnapshot {
    storages: Array<{
        name?: string
        adapter: string
        plugins: string[]
        initialized: boolean
    }>
    diagnostics: FilesDevtoolsDiagnostic[]
    dependencies: DependencyDiagnostic[]
}

export default async (event: RequestEvent, secret: string) => {
    if (!(await authorizeFilesDevtoolsRequest(event.req, secret))) {
        return new Response(null, { status: 401 })
    }
    const snapshot = inspectFiles()
    return Response.json({
        ...snapshot,
        diagnostics: snapshot.diagnostics.map(({ code, name, adapter }) =>
            createFilesDevtoolsDiagnostic(
                code,
                adapter
                    ? `${name === undefined ? 'The single storage' : `Storage "${name}"`} (${adapter}) could not be initialized.`
                    : undefined,
            ),
        ),
    })
}
