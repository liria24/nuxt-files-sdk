export default defineNuxtConfig({
    compatibilityDate: '2026-09-04',
    modules: ['@nuxt/ui', 'nuxt-files-sdk'],
    css: ['~/assets/css/main.css'],
    ui: {
        colorMode: false,
        experimental: { componentDetection: true },
        fonts: false,
    },
    nitro: { minify: true },
    devtools: { enabled: false },
})
