import { inspectFiles } from '../runtime'
import type { FilesDevtoolsDiagnostic } from './diagnostics'

export interface FilesDevtoolsSnapshot {
    storages: Array<{
        name?: string
        adapter: string
        plugins: string[]
        source: 'storage' | 'devStorage'
        initialized: boolean
    }>
    diagnostics: FilesDevtoolsDiagnostic[]
}

export const FILES_DEVTOOLS_PATH = '/__nuxt-files-sdk/'
export const FILES_SNAPSHOT_PATH = `${FILES_DEVTOOLS_PATH}snapshot`
export const FILES_GATEWAY_PATH = `${FILES_DEVTOOLS_PATH}files`
export const FILES_DEVTOOLS_MAX_UPLOAD_SIZE = 10 * 1024 * 1024

export default () => inspectFiles()
