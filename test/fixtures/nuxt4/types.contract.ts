import { FilesError, sync, transfer } from 'files-sdk'
import type { FileHandle, Files, FilesPlugin, StoredFile, SyncResult, TransferResult } from 'files-sdk'
import type { FsAdapter } from 'files-sdk/fs'
import type { MemoryAdapter } from 'files-sdk/memory'
import { memory } from 'files-sdk/memory'
import { tiering } from 'files-sdk/tiering'
import { versioning } from 'files-sdk/versioning'
import { defineFilesConfig, type FilesPluginContext } from 'nuxt-files-sdk/config'
import type { SingleStorage, StorageRegistry } from 'nuxt-files-sdk/runtime'
import { syncFiles as importedSyncFiles, transferFiles as importedTransferFiles } from 'nuxt-files-sdk/runtime'

const switchedConfig = defineFilesConfig({
    storage: { adapter: 'fs', config: { root: '.' }, plugins: [versioning()] },
    devStorage: { adapter: 'memory' },
})
const assertSwitchedTypes = (files: SingleStorage<typeof switchedConfig>): void => {
    files.adapter satisfies FsAdapter | MemoryAdapter
    // @ts-expect-error development can select memory, so fs-only access needs narrowing
    files.adapter satisfies FsAdapter
    void files.versions('example.txt')
}
void assertSwitchedTypes

const custom = (options: { endpoint: string }) => (void options, memory())
const customSingle = defineFilesConfig({ storage: { adapter: custom, config: { endpoint: 'https://example.com' } } })
const assertCustomAdapter = (files: SingleStorage<typeof customSingle>): void => {
    files.adapter satisfies ReturnType<typeof custom>
}
void assertCustomAdapter
const composedConfig = defineFilesConfig({
    storage: {
        archive: { adapter: 'memory' },
        uploads: {
            adapter: custom,
            config: { endpoint: 'https://example.com' },
            plugins: ({ storage }: FilesPluginContext) => [
                versioning(),
                tiering({
                    cold: storage('archive'),
                    route: ({ key }) => (key.startsWith('archive/') ? 'cold' : 'hot'),
                }),
            ],
        },
    },
    devStorage: { uploads: { adapter: 'fs', config: { root: '.' } } },
})
const assertComposedTypes = (files: StorageRegistry<typeof composedConfig>['uploads']): void => {
    files.adapter satisfies ReturnType<typeof custom> | FsAdapter
    void files.versions('example.txt')
    void files.tierOf('example.txt')
}
void assertComposedTypes
void [importedSyncFiles, importedTransferFiles]

const builtinComposition = defineFilesConfig({
    storage: {
        archive: { adapter: 'memory' },
        uploads: {
            adapter: 'memory',
            plugins: ({ storage }) => [tiering({ cold: storage('archive'), route: () => 'hot' })],
        },
    },
})
void (null as unknown as StorageRegistry<typeof builtinComposition>['uploads']).tierOf('x')

// @ts-expect-error custom adapter config retains its parameter type
defineFilesConfig({ storage: { adapter: custom, config: { missing: true } } })
// @ts-expect-error custom adapter requires its configuration
defineFilesConfig({ storage: { adapter: custom } })
// @ts-expect-error named custom adapter config retains its parameter type
defineFilesConfig({ storage: { uploads: { adapter: custom, config: { missing: true } } } })

void syncFiles('blob', 'archive', { compare: 'size', prune: true })
void transferFiles('blob', 'archive', { overwrite: false })
// @ts-expect-error generated storage names are enforced
void syncFiles('missing', 'archive')
// @ts-expect-error generated storage names are enforced
void transferFiles('archive', 'missing')

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
    void syncFiles(files, archive)
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
