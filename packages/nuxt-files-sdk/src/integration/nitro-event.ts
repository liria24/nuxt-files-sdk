import type { RequestEvent } from '@nuxt/schema'

/** Adapt standalone Nitro only. Nuxt handlers already receive its public RequestEvent. */
export const nitroRequestEvent = (req: Request, context: RequestEvent['context']): RequestEvent => ({
    req,
    url: new URL(req.url),
    context,
    res: { headers: new Headers() },
})

/** Preserve response changes made by portable authorization callbacks. */
export const nitroResponse = (response: Response, event: RequestEvent): Response => {
    const headers = new Headers(response.headers)
    for (const [name, value] of event.res.headers) headers.set(name, value)
    return new Response(response.body, {
        status: event.res.status ?? response.status,
        statusText: event.res.statusText ?? response.statusText,
        headers,
    })
}
