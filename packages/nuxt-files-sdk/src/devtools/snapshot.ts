import { inspectFiles } from '../runtime'

export interface FilesDevtoolsSnapshot {
    storages: Array<{
        name: string
        adapter: string
        plugins: string[]
        source: 'storage' | 'devStorage'
        initialized: boolean
    }>
    diagnostics: Array<{
        code: string
        level: 'info' | 'warning' | 'error'
        message: string
    }>
}

export const FILES_DEVTOOLS_PATH = '/__nuxt-files-sdk/'
export const FILES_SNAPSHOT_PATH = `${FILES_DEVTOOLS_PATH}snapshot`

export default () => inspectFiles()
