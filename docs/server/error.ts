import { sendError, setResponseHeaders } from 'h3'
import { defineNitroErrorHandler } from 'nitropack/runtime'

export default defineNitroErrorHandler((error, event) => {
    setResponseHeaders(event, {
        'cache-control': 'no-store',
        'cloudflare-cdn-cache-control': 'no-store',
        'content-security-policy': "script-src 'none'; frame-ancestors 'none';",
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
    })
    return sendError(event, error)
})
