export default defineEventHandler(async (event) => {
    const requested = getRouterParam(event, 'path') ?? ''
    if (!requested.endsWith('.md')) throw createError({ statusCode: 404, statusMessage: 'Markdown page not found.' })

    const route = requested === 'index.md' ? '/' : `/${requested.slice(0, -3)}`
    const content = await getDocsContent(event)
    const item = content.stat(route)
    if (!item || item.meta.kind !== 'document' || item.meta.extension !== '.md') {
        throw createError({ statusCode: 404, statusMessage: 'Markdown page not found.' })
    }

    const source = content.getSource()
    const key = item.meta.key.split('/').slice(1).join('/')
    const markdown = source && (await source.getItem(key))
    if (typeof markdown !== 'string') throw createError({ statusCode: 404, statusMessage: 'Markdown page not found.' })

    setResponseHeader(event, 'content-type', 'text/markdown; charset=utf-8')
    return markdown
})
