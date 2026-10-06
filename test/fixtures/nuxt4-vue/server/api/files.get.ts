import type { NuxtFilesStorageRegistry } from 'nuxt-files-sdk/runtime'

import type { FsAdapter } from '#files-sdk/fs'

import type config from '../../files.config'

type IsAny<T> = 0 extends 1 & T ? true : false
const assertAutoImportedTypes = (): void => {
    const helperIsAny: IsAny<typeof defineFilesConfig> = false
    const configIsAny: IsAny<typeof config> = false
    const noNamedStorages: keyof NuxtFilesStorageRegistry extends never ? true : false = true
    const files = useServerFiles()
    const clientIsAny: IsAny<typeof files> = false
    files.adapter satisfies FsAdapter
    void [helperIsAny, configIsAny, noNamedStorages, clientIsAny]
    // @ts-expect-error unnamed storage cannot accept arbitrary named access
    useServerFiles('missing')
}
void assertAutoImportedTypes

export default defineEventHandler(() => {
    const files = useServerFiles()
    files.adapter satisfies FsAdapter
    return files.adapter.name
})
