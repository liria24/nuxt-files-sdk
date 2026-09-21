import { fileURLToPath } from 'node:url'

import { defineDevframe, defineRpcFunction } from 'devframe'

import { version } from '../../package.json'
import { createFilesDevtoolsToken } from './auth'
import {
    createFilesDevtoolsDiagnostic,
    FILES_DEVTOOLS_DIAGNOSTICS,
    isFilesDevtoolsDiagnostic,
    isFilesDevtoolsFailure,
    type FilesDevtoolsDiagnostic,
} from './diagnostics'
import { FILES_DEVTOOLS_PATH } from './snapshot'

interface FilesDevframeMessage {
    id: string
    message: string
    level: 'error'
    description: string
    category: string
    labels: string[]
    notify: true
}

export interface FilesDevframeOptions {
    write: boolean
    maxUploadSize: number
    tokenSecret: string
    notifyFailure: (message: FilesDevframeMessage) => unknown
}

const clientAssets = fileURLToPath(new URL('./client', import.meta.url))
const messageTitles = {
    upload: 'Files upload failed',
    delete: 'Files delete failed',
    initialization: 'Files storage initialization failed',
    gateway: 'Files DevTools gateway failed',
} as const

export const createFilesDevframe = ({ write, maxUploadSize, tokenSecret, notifyFailure }: FilesDevframeOptions) =>
    defineDevframe({
        id: 'nuxt-files-sdk',
        name: 'Files',
        version,
        packageName: 'nuxt-files-sdk',
        importMetaUrl: import.meta.url,
        homepage: 'https://github.com/liria24/nuxt-files-sdk',
        description: 'Files SDK storage and integration diagnostics for Nuxt.',
        icon: 'ph:files-duotone',
        clientAssets,
        async setup(context) {
            await context.host.mountConnectionMeta?.(FILES_DEVTOOLS_PATH)
            context.views.hostStatic(FILES_DEVTOOLS_PATH, clientAssets)

            const definitions = Object.fromEntries(
                Object.entries(FILES_DEVTOOLS_DIAGNOSTICS).map(([code, diagnostic]) => [
                    code,
                    {
                        why: ({ message }: { message?: string }) => message ?? diagnostic.message,
                        fix: diagnostic.hint,
                        docs: diagnostic.docs,
                    },
                ]),
            )
            const diagnostics = context.diagnostics.defineDiagnostics({ codes: definitions })
            context.diagnostics.register(diagnostics)
            const reported = new Set<string>()
            const reportDiagnostic = (diagnostic: FilesDevtoolsDiagnostic, cause?: unknown): void => {
                const key = `${diagnostic.code}:${diagnostic.message}`
                if (reported.has(key)) return
                reported.add(key)
                diagnostics[diagnostic.code]?.(
                    { message: diagnostic.message, ...(cause === undefined ? {} : { cause }) },
                    { method: diagnostic.level === 'info' ? 'log' : diagnostic.level === 'warning' ? 'warn' : 'error' },
                )
            }

            const scoped = context.scope('nuxt-files-sdk')
            scoped.rpc.register(
                defineRpcFunction({
                    name: 'issue-http-token',
                    type: 'query',
                    handler: () => createFilesDevtoolsToken(tokenSecret),
                }),
            )
            scoped.rpc.register(
                defineRpcFunction({
                    name: 'report-diagnostics',
                    type: 'event',
                    handler(value: unknown) {
                        if (Array.isArray(value))
                            value.filter(isFilesDevtoolsDiagnostic).forEach((item) => reportDiagnostic(item))
                    },
                }),
            )
            scoped.rpc.register(
                defineRpcFunction({
                    name: 'report-failure',
                    type: 'event',
                    handler(value: unknown) {
                        if (!isFilesDevtoolsFailure(value)) return
                        if (!write && (value.kind === 'upload' || value.kind === 'delete')) return
                        const description =
                            value.kind === 'upload'
                                ? `${value.message}\nMaximum upload size: ${maxUploadSize} bytes.`
                                : value.message
                        void notifyFailure({
                            id: `nuxt-files-sdk:${value.kind}:${value.target ?? 'default'}`,
                            message: messageTitles[value.kind],
                            level: 'error',
                            description,
                            category: 'nuxt-files-sdk',
                            labels: ['nuxt-files-sdk', value.kind],
                            notify: true,
                        })
                        if (value.kind === 'initialization') {
                            reportDiagnostic(
                                createFilesDevtoolsDiagnostic('NUXT_FILES_ADAPTER_INIT_FAILED'),
                                value.message,
                            )
                        } else if (value.kind === 'gateway') {
                            reportDiagnostic(createFilesDevtoolsDiagnostic('NUXT_FILES_GATEWAY_FAILED'), value.message)
                        }
                    },
                }),
            )
        },
    })
