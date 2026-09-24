import type { MemoryAdapter } from 'files-sdk/memory'
import { defineEventHandler } from 'nitro/h3'
import { useServerFiles } from 'nuxt-files-sdk/runtime'

const assertCustomAdapterType = () => {
    useServerFiles('custom').adapter satisfies MemoryAdapter
}
void assertCustomAdapterType

export default defineEventHandler(async () => {
    const files = useServerFiles('archive')
    const blob = useServerFiles('blob')
    return {
        adapter: files.adapter.name,
        namedAdapter: blob.adapter.name,
        versions: (await files.versions('missing.txt')).length,
    }
})
