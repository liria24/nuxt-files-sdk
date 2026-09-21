import { defineNitroConfig } from 'nitro/config'

export default defineNitroConfig({
    compatibilityDate: '2026-09-04',
    modules: ['nuxt-files-sdk/nitro'],
    preset: 'cloudflare-module',
})
