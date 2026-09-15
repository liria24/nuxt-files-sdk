import { versioning } from 'files-sdk/versioning'
import { defineFilesConfig } from 'nuxt-files-sdk/config'

export default defineFilesConfig({
    storage: { adapter: 'fs', config: { root: '.data/files' }, plugins: [versioning()] },
})
