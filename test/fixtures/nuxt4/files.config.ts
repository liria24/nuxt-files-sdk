import { defineFilesConfig } from 'nuxt-files-sdk/config'
import { versioning } from 'nuxt-files-sdk/plugins'

export default defineFilesConfig({
    default: 'archive',
    storage: {
        archive: { adapter: 'fs', root: '.data/archive', plugins: [versioning()] },
        blob: { adapter: 'fs', root: '.data/files', plugins: [versioning()] },
    },
})
