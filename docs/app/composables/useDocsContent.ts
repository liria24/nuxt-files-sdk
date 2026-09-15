import { createContentClient } from 'comark-content/client'

export function useDocsContent() {
    return createContentClient({
        basePath: '/api/content',
        fetch: import.meta.server ? useRequestFetch() : $fetch,
        plugins: [searchSectionsClient()],
    })
}
