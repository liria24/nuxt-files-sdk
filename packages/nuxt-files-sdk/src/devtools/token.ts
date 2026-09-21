import { createFilesDevtoolsToken } from './auth'

export default async (
    event: {
        node: { req: { headers: { get?: (name: string) => string | null | undefined; [key: string]: unknown } } }
    },
    secret: string,
    authorize: (token: string) => Promise<void>,
) => {
    const headers = event.node.req.headers
    const received = headers.get?.('x-nuxt-devtools-token') ?? headers['x-nuxt-devtools-token']
    if (typeof received !== 'string' || !received) return new Response(null, { status: 401 })
    try {
        await authorize(received)
    } catch {
        return new Response(null, { status: 401 })
    }
    return Response.json(await createFilesDevtoolsToken(secret), { headers: { 'cache-control': 'no-store' } })
}
