export default defineNitroPlugin((nitroApp) => {
    nitroApp.hooks.hook('llms:generate', async (event, options) => {
        const content = await getDocsContent(event)
        const home = await content.get<Record<string, unknown>>('/')
        if (typeof home?.data.description === 'string') options.description = home.data.description

        options.sections.push({
            title: 'Documentation',
            links: [
                { title: 'Introduction', href: `${options.domain}/raw/index.md` },
                ...flattenNavigation(await content.navigation()).map((item) => ({
                    title: item.title,
                    href: `${options.domain}/raw${item.path}.md`,
                })),
            ],
        })
    })
})
