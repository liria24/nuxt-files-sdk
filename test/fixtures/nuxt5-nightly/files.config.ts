import { versioning } from 'files-sdk/versioning'

export default defineFilesConfig({
    storage: { adapter: 'fs', config: { root: '.data/files' }, plugins: [versioning()] },
    routes: [{ path: '/api/gateway', operations: ['capabilities', 'list'] }],
})
