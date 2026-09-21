import { createFilesDevtoolsToken } from './auth'

export default async (
    event: {
        node: { req: { headers: { get?: (name: string) => string | null | undefined; [key: string]: unknown } } }
    },
    secret: string,
    expected: string,
) => {
    const headers = event.node.req.headers
    const received = headers.get?.('x-nuxt-files-sdk-bootstrap') ?? headers['x-nuxt-files-sdk-bootstrap']
    if (received !== expected) return new Response(null, { status: 401 })
    return Response.json(await createFilesDevtoolsToken(secret))
}
