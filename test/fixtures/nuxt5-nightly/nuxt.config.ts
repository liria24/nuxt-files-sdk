export default defineNuxtConfig({
    compatibilityDate: '2026-09-04',
    files: { ui: false },
    modules: ['nuxt-files-sdk'],
    nitro: { minify: true },
    devtools: { enabled: true },
})
