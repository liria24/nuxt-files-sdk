export default defineEventHandler(async () => {
    const files = await useServerFiles('blob')
    return { adapter: files.adapter.name }
})
