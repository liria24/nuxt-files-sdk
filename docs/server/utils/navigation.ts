import type { NavigationItem } from 'comark-content'

export const flattenNavigation = (items: NavigationItem[]): NavigationItem[] =>
    items.flatMap((item) => [
        ...(item.page === false || item.path === '/' ? [] : [item]),
        ...flattenNavigation(item.children ?? []),
    ])
