export default defineEventHandler(async (event) => {
    const content = await getDocsContent(event)
    if (getRouterParam(event, 'path') === 'search-sections') return buildSearchSections(content)
    return content.handler(toWebRequest(event))
})
