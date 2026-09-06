import { defineFilesConfig } from 'nuxt-files-sdk/config'
import { versioning } from 'nuxt-files-sdk/plugins'

export default defineFilesConfig({
    storage: {
        default: { adapter: 'fs', root: '.data/default', plugins: [versioning()] },
        blob: { adapter: 'fs', root: '.data/files' },
    },
})
