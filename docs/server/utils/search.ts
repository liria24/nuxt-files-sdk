import type { AnyComarkContent, ContentFile } from 'comark-content'

export interface SearchSection {
    id: string
    title: string
    titles: string[]
    level: number
    content: string
}

const searchCacheKey = 'search-sections'

export function invalidateSearchSections(content: AnyComarkContent) {
    return content.cache.invalidate(searchCacheKey)
}

export async function buildSearchSections(content: AnyComarkContent): Promise<SearchSection[]> {
    const cached = await content.cache.get<SearchSection[]>(searchCacheKey)
    if (cached) return cached

    const files = await content.list<Record<string, unknown>>()
    const pages = await Promise.all(files.map((file) => content.get<Record<string, unknown>>(file.path)))
    const sections = pages.flatMap((page, index) =>
        page && page.meta.kind === 'document' ? sectionsForPage(page, files[index]!.path) : [],
    )

    await content.cache.set(searchCacheKey, sections)
    return sections
}

function sectionsForPage(page: ContentFile<Record<string, unknown>>, fallbackTitle: string): SearchSection[] {
    const data = page.data
    const pageTitle = typeof data.title === 'string' ? data.title : fallbackTitle
    const description = typeof data.description === 'string' ? data.description : ''
    const sections: SearchSection[] = [{ id: page.path, title: pageTitle, titles: [], level: 1, content: description }]
    const titles = [pageTitle]
    let previousLevel = 0
    let current = sections[0]!

    for (const node of page.nodes ?? []) {
        const tag = getTag(node)
        const level = headingLevel(tag)
        if (level > 0) {
            const title = extractText(node).trim()
            if (level === 1) titles.splice(0)
            else if (level < previousLevel) titles.splice(level - 1)
            else if (level === previousLevel) titles.pop()

            const id = getAttributes(node).id
            current = {
                id: typeof id === 'string' ? `${page.path}#${id}` : page.path,
                title,
                titles: [...titles],
                level,
                content: '',
            }
            sections.push(current)
            titles.push(title)
            previousLevel = level
        } else {
            const text = extractText(node).trim()
            if (text) current.content = current.content ? `${current.content} ${text}` : text
        }
    }

    return sections
}

function extractText(node: unknown): string {
    if (typeof node === 'string') return node
    if (!Array.isArray(node) || node[0] === null) return ''
    return node.slice(2).map(extractText).filter(Boolean).join(' ')
}

function getTag(node: unknown): string {
    return Array.isArray(node) && typeof node[0] === 'string' ? node[0] : ''
}

function getAttributes(node: unknown): Record<string, unknown> {
    return Array.isArray(node) && node[1] && typeof node[1] === 'object'
        ? Object.fromEntries(Object.entries(node[1]))
        : {}
}

function headingLevel(tag: string): number {
    const match = /^h([1-6])$/u.exec(tag)
    return match ? Number(match[1]) : 0
}
