export default defineEventHandler(() => {
    const files = useServerFiles()
    return { adapter: files.adapter.name }
})
