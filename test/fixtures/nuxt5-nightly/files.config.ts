import { defineFilesConfig } from 'nuxt-files-sdk/config'
import { versioning } from 'nuxt-files-sdk/plugins'

export default defineFilesConfig({
    storage: { blob: { adapter: 'fs', root: '.data/files', plugins: [versioning()] } },
})
