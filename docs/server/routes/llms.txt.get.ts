export default defineEventHandler(async (event) => {
    const content = await getDocsContent(event)
    const config = useRuntimeConfig(event)
    const navigation = flattenNavigation(await content.navigation())
    const home = await content.get<Record<string, unknown>>('/')
    const description = home?.data.description
    const lines = [
        '# Nuxt Files SDK',
        '',
        typeof description === 'string' ? description : 'Native-first Files SDK integration for Nuxt and Nitro.',
        '',
        '## Documentation',
        '',
        `- [Introduction](${config.public.siteUrl}/raw/index.md)`,
        ...navigation.map((item) => `- [${item.title}](${config.public.siteUrl}/raw${item.path}.md)`),
        '',
    ]
    setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
    return lines.join('\n')
})
