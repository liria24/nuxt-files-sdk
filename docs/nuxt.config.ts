import { fileURLToPath } from 'node:url'

const deployedSiteUrl = process.env.NUXT_PUBLIC_SITE_URL
const siteUrl =
    deployedSiteUrl ||
    (process.env.NODE_ENV === 'production' ? 'https://nuxt-files-sdk.liria.me' : 'http://localhost:3000')

export default defineNuxtConfig({
    compatibilityDate: '2026-09-04',

    devtools: { enabled: true },

    modules: [
        '@nuxtjs/i18n',
        '@nuxt/image',
        '@nuxt/fonts',
        '@nuxtjs/sitemap',
        '@nuxtjs/robots',
        'nuxt-og-image',
        '@nuxt/ui',
        '@comark/nuxt',
        'nuxt-files-sdk',
        '@vueuse/nuxt',
    ],

    css: ['~/assets/css/main.css'],

    ignore: ['content/**'],

    runtimeConfig: {
        docs: {
            repository: 'liria24/nuxt-files-sdk',
            branch: 'main',
            contentDir: 'docs/content',
            contentPath: fileURLToPath(new URL('./content', import.meta.url)),
            refreshInterval: 60_000,
        },
        public: { siteUrl },
    },

    nitro: {
        preset: 'cloudflare-module',
        cloudflare: {
            deployConfig: true,
            wrangler: {
                name: 'nuxt-files-sdk-docs',
                compatibility_date: '2026-09-04',
                compatibility_flags: ['nodejs_compat'],
                preview_urls: false,
                routes: [{ pattern: 'nuxt-files-sdk.liria.me', custom_domain: true }],
                kv_namespaces: [
                    {
                        binding: 'DOCS_CACHE',
                        id: 'f3da43e9be0643b2b83bcf193a6d267d',
                    },
                ],
                observability: {
                    enabled: true,
                },
            },
        },
        routeRules: {
            '/**': { headers: { 'cache-control': 'no-store' } },
            '/_nuxt/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
        },
    },

    site: {
        url: siteUrl,
        name: 'Nuxt Files SDK',
    },

    i18n: {
        baseUrl: siteUrl,
        defaultLocale: 'en',
        locales: [{ code: 'en', language: 'en-US', name: 'English' }],
        strategy: 'no_prefix',
        detectBrowserLanguage: false,
    },

    fonts: {
        provider: 'google',
        throwOnError: true,
        families: [
            { name: 'Geist', global: true, weights: [400, 500, 600, 700] },
            { name: 'Geist Mono', global: true, weights: [400, 500, 600, 700] },
        ],
    },

    sitemap: {
        sources: ['/api/__sitemap__/urls'],
        excludeAppSources: ['nuxt:pages', '@nuxtjs/i18n:pages'],
    },

    ogImage: {
        security: { restrictRuntimeImagesToOrigin: true },
    },

    ui: {
        prose: true,
    },
})
