export function docsCacheHeaders(path: string, status: number, hasSetCookie = false) {
    if (status === 200 && path === '/' && !hasSetCookie) {
        return {
            'cache-control': 'public, max-age=0',
            'cloudflare-cdn-cache-control': 'public, max-age=86400',
            vary: 'Cookie',
        }
    }
    if (status === 200 && (path === '/_nuxt' || path.startsWith('/_nuxt/'))) return undefined
    return { 'cache-control': 'no-store', 'cloudflare-cdn-cache-control': 'no-store' }
}
