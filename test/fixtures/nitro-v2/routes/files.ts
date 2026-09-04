import { useServerFiles } from 'nuxt-files-sdk/nitro'
export default defineEventHandler(async () => ({
    adapter: (await useServerFiles('blob')).adapter.name,
}))
