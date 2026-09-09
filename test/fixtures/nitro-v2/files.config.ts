import { defineFilesConfig } from 'nuxt-files-sdk/config'
import { versioning } from 'nuxt-files-sdk/plugins/versioning'

export default defineFilesConfig({
    storage: { adapter: 'fs', config: { root: '.data/files' }, plugins: [versioning()] },
})
