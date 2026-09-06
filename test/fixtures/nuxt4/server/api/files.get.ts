export default defineEventHandler(async () => {
    const files = await useServerFiles('blob')
    const archive = await useServerFiles()
    const versions = await archive.versions('missing.txt')
    return { adapter: files.adapter.name, defaultAdapter: archive.adapter.name, versions: versions.length }
})
