import { recordDocsTiming } from '../../utils/timing'

export default defineEventHandler(async (event) => {
    const content = await getDocsContent(event)
    if (getRouterParam(event, 'path') === 'search-sections') return buildSearchSections(content)
    const started = performance.now()
    const response = await content.handler(toWebRequest(event))
    recordDocsTiming(event, 'docs-handler', started)
    return response
})
