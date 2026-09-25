import { docsCacheHeaders } from '../utils/cache-policy'

export default defineNitroPlugin((nitroApp) => {
    nitroApp.hooks.hook('beforeResponse', (event) => {
        const path = event.path.split('?')[0]!
        const headers = docsCacheHeaders(
            path,
            getResponseStatus(event),
            String(getResponseHeader(event, 'content-type') ?? ''),
            Boolean(getResponseHeader(event, 'set-cookie')),
        )
        if (!headers) return
        const vary = String(getResponseHeader(event, 'vary') ?? '')
        setResponseHeaders(event, headers)
        if (path === '/' && headers['cache-control'] !== 'no-store' && vary) {
            setResponseHeader(event, 'vary', /\bcookie\b/iu.test(vary) ? vary : `${vary}, Cookie`)
        }
    })
})
