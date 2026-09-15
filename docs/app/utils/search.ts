import { defineContentClientPlugin } from 'comark-content/client'

export interface SearchSection {
    id: string
    title: string
    titles: string[]
    level: number
    content: string
}

interface SearchMethods {
    searchSections(): Promise<SearchSection[]>
}

export const searchSectionsClient = defineContentClientPlugin<Record<string, never>, SearchMethods>(() => ({
    name: 'search-sections',
    setup: ({ options }) => ({
        searchSections: () => options.fetch<SearchSection[]>(`${options.baseURL}${options.basePath}/search-sections`),
    }),
}))
