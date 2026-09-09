import { useServerFiles } from 'nuxt-files-sdk/runtime'

export default defineEventHandler(async () => {
    const files = useServerFiles()
    return { adapter: files.adapter.name, versions: (await files.versions('missing.txt')).length }
})
