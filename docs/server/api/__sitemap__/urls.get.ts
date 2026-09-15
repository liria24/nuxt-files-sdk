export default defineEventHandler(async (event) => {
    const content = await getDocsContent(event)
    return ['/', ...flattenNavigation(await content.navigation()).map((item) => item.path)]
})
