import { versioning } from 'files-sdk/versioning'
import { defineFilesConfig } from 'nuxt-files-sdk/config'

export default defineFilesConfig({
    storage: {
        archive: { adapter: 'fs', config: { root: '.data/default' }, plugins: [versioning()] },
        blob: { adapter: 'fs', config: { root: '.data/files' } },
    },
})
