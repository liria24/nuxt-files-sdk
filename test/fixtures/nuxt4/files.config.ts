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
    devStorage: {
        blob: { adapter: 'fs', config: { root: '.', urlBaseUrl: 'NUXT_FILES_DEV_ONLY' } },
    },
})
