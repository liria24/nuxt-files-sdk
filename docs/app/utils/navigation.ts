import type { NavigationMenuItem } from '@nuxt/ui'
import type { NavigationItem } from 'comark-content'

export const toMenuItems = (items: NavigationItem[]): NavigationMenuItem[] =>
    items.map((item) => ({
        label: item.title,
        to: item.page === false ? undefined : item.path,
        defaultOpen: true,
        children: item.children?.length ? toMenuItems(item.children) : undefined,
    }))

export const flattenPages = (items: NavigationItem[]): NavigationItem[] =>
    items.flatMap((item) => [
        ...(item.page === false || item.path === '/' ? [] : [item]),
        ...flattenPages(item.children ?? []),
    ])

export const firstPage = (items: NavigationItem[] | undefined, path: string): string | undefined => {
    const section = items?.find((item) => item.path === path)
    return section && flattenPages([section])[0]?.path
}

export const surroundingPages = (items: NavigationItem[], path: string) => {
    const pages = flattenPages(items)
    const index = pages.findIndex((item) => item.path === path)
    return index < 0
        ? []
        : [pages[index - 1], pages[index + 1]].filter((item): item is NavigationItem => item !== undefined)
}
