import type { FsAdapter } from '#files-sdk/fs'

export default defineEventHandler(() => {
    const files = useServerFiles()
    files.adapter satisfies FsAdapter
    return files.adapter.name
})
