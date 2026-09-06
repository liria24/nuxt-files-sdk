import { useServerFiles } from 'nuxt-files-sdk/runtime'

export default defineEventHandler(async () => {
    const files = await useServerFiles()
    return { adapter: files.adapter.name, versions: (await files.versions('missing.txt')).length }
})
