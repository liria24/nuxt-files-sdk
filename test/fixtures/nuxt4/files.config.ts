import { versioning } from 'files-sdk/versioning'

export default defineFilesConfig({
    storage: {
        archive: {
            adapter: 'fs',
            config: { root: '.' },
            prefix: '.data/archive/',
            plugins: [versioning()],
        },
        blob: {
            adapter: 'fs',
            config: { root: '.' },
            prefix: '.data/files/',
        },
    },
    $development: {
        storage: { blob: { adapter: 'fs', config: { root: '.', urlBaseUrl: 'NUXT_FILES_DEV_ONLY' } } },
    },
    $production: { storage: { archive: { adapter: 'fs', config: { root: '.data/production-archive' } } } },
    $prerender: { storage: { archive: { adapter: 'memory' } } },
    $env: { staging: { storage: { archive: { adapter: 'memory' } } } },
    routes: [{ path: '/api/gateway', storage: 'archive', operations: ['capabilities', 'list'] }],
})
