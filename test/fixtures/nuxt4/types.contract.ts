import { FilesError, sync, transfer } from 'nuxt-files-sdk'
import type { FileHandle, Files, FilesPlugin, StoredFile, SyncResult, TransferResult } from 'nuxt-files-sdk'

const publicRuntime = { FilesError, sync, transfer }
void publicRuntime
type IsAny<T> = 0 extends 1 & T ? true : false

const assertNativeTypes = async (): Promise<void> => {
    const files: Files = useServerFiles('blob')
    const inferredFiles = useServerFiles('blob')
    const isAny: IsAny<typeof inferredFiles> = false
    const deleted = await inferredFiles.delete(['missing.txt'])
    deleted.deleted satisfies string[]
    const handle: FileHandle = files.file('example.txt')
    const stored: StoredFile = await handle.head()
    const archive = useServerFiles('archive')
    const versions = await archive.versions('example.txt')
    const plugin: FilesPlugin = { name: 'contract' }
    const syncResult = {} as SyncResult
    const transferResult = {} as TransferResult
    void [stored, versions, plugin, syncResult, transferResult, isAny]
}

void assertNativeTypes
