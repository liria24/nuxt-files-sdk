import { defineFilesConfig } from 'nuxt-files-sdk/config'
export default defineFilesConfig({ storage: { blob: { adapter: 'fs', root: '.data/files' } } })
