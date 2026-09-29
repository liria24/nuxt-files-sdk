import type { NavigationMenuItem } from '@nuxt/ui'
import type { NavigationItem } from 'comark-content'

import { flattenNavigation } from '#shared/utils/navigation'

export const toMenuItems = (items: NavigationItem[]): NavigationMenuItem[] =>
    items.map((item) => ({
        label: item.title,
        to: item.page === false ? undefined : item.path,
        defaultOpen: true,
        children: item.children?.length ? toMenuItems(item.children) : undefined,
    }))

export const firstPage = (items: NavigationItem[] | undefined, path: string): string | undefined => {
    const section = items?.find((item) => item.path === path)
    return section && flattenNavigation([section])[0]?.path
}

export const surroundingPages = (items: NavigationItem[], path: string) => {
    const pages = flattenNavigation(items)
    const index = pages.findIndex((item) => item.path === path)
    return index < 0
        ? []
        : [pages[index - 1], pages[index + 1]].filter((item): item is NavigationItem => item !== undefined)
}
