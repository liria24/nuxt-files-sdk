export default defineEventHandler(async () => {
    const files = await useServerFiles()
    const versions = await files.versions('missing.txt')
    return { adapter: files.adapter.name, versions: versions.length }
})
