export default defineEventHandler(async () => {
    const files = useServerFiles('blob')
    const archive = useServerFiles('archive')
    const versions = await archive.versions('missing.txt')
    return { adapter: files.adapter.name, defaultAdapter: archive.adapter.name, versions: versions.length }
})
