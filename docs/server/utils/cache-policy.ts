const docsTag = 'nuxt-files-sdk-docs'

export function docsCacheHeaders(path: string, status: number, contentType?: string, hasSetCookie = false) {
    if (status !== 200 || path === '/api' || path.startsWith('/api/') || hasSetCookie) {
        return { 'cache-control': 'no-store', 'cloudflare-cdn-cache-control': 'no-store' }
    }
    if (path === '/_nuxt' || path.startsWith('/_nuxt/')) return undefined

    const ttl =
        path === '/'
            ? 86_400
            : path.startsWith('/raw/') ||
                path === '/llms.txt' ||
                path === '/sitemap.xml' ||
                contentType?.includes('text/html')
              ? 60
              : 0
    if (!ttl) return { 'cache-control': 'no-store', 'cloudflare-cdn-cache-control': 'no-store' }

    return {
        'cache-control': 'public, max-age=0',
        'cloudflare-cdn-cache-control': `public, max-age=${ttl}`,
        ...(path === '/' ? { vary: 'Cookie' } : { 'cache-tag': docsTag }),
    }
}

export const docsCacheTag = docsTag
