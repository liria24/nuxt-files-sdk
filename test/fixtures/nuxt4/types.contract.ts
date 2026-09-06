import { FilesError, sync, transfer } from 'nuxt-files-sdk'
import type { FileHandle, Files, FilesPlugin, StoredFile, SyncResult, TransferResult } from 'nuxt-files-sdk'

const publicRuntime = { FilesError, sync, transfer }
void publicRuntime

const assertNativeTypes = async (): Promise<void> => {
    const files: Files = await useServerFiles('blob')
    const handle: FileHandle = files.file('example.txt')
    const stored: StoredFile = await handle.head()
    const archive = await useServerFiles()
    const versions = await archive.versions('example.txt')
    const plugin: FilesPlugin = { name: 'contract' }
    const syncResult = {} as SyncResult
    const transferResult = {} as TransferResult
    void [stored, versions, plugin, syncResult, transferResult]
}

void assertNativeTypes
