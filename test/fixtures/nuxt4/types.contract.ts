import { FilesError, sync, transfer } from 'files-sdk'
import type { FileHandle, Files, FilesPlugin, StoredFile, SyncResult, TransferResult } from 'files-sdk'

const publicRuntime = { FilesError, sync, transfer }
void publicRuntime
type IsAny<T> = 0 extends 1 & T ? true : false

const assertNativeTypes = async (): Promise<void> => {
    const files: Files = useServerFiles('blob')
    const inferredFiles = useServerFiles('blob')
    const isAny: IsAny<typeof inferredFiles> = false
    const deleted = await inferredFiles.delete(['missing.txt'])
    deleted.deleted satisfies string[]
    inferredFiles.raw.root satisfies string
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

// @ts-expect-error provider factory mapping is internal
import type { ProviderFactories } from 'nuxt-files-sdk/config'
// @ts-expect-error Nitro exports only its integration module
import type { useServerFiles as nitroAccessor } from 'nuxt-files-sdk/nitro'
// @ts-expect-error registry construction is internal
import type { FilesRegistry } from 'nuxt-files-sdk/runtime'
// @ts-expect-error registry initialization is internal
import type { configureFiles } from 'nuxt-files-sdk/runtime'
// @ts-expect-error diagnostics are internal
import type { inspectFiles } from 'nuxt-files-sdk/runtime'
// @ts-expect-error generated factories are internal
import type { FilesProviderFactories } from 'nuxt-files-sdk/runtime'
// @ts-expect-error package exports block internal subpaths
import type { configureFiles as internalConfigure } from 'nuxt-files-sdk/runtime/internal'
