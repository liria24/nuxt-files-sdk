import { defineFilesConfig } from 'nuxt-files-sdk/config'
import { versioning } from 'nuxt-files-sdk/plugins/versioning'

export default defineFilesConfig({
    storage: {
        archive: { adapter: 'fs', config: { root: '.data/default' }, plugins: [versioning()] },
        blob: { adapter: 'fs', config: { root: '.data/files' } },
    },
})
