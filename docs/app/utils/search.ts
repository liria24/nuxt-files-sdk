import { defineContentClientPlugin } from 'comark-content/client'

import type { SearchSection } from '../../shared/search'

interface SearchMethods {
    searchSections(): Promise<SearchSection[]>
}

export const searchSectionsClient = defineContentClientPlugin<Record<string, never>, SearchMethods>(() => ({
    name: 'search-sections',
    setup: ({ options }) => ({
        searchSections: () => options.fetch<SearchSection[]>(`${options.baseURL}${options.basePath}/search-sections`),
    }),
}))
