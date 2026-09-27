import { memory } from 'files-sdk/memory'
import { versioning } from 'files-sdk/versioning'
import { defineFilesConfig } from 'nuxt-files-sdk/config'

const custom = () => memory()

export default defineFilesConfig({
    storage: {
        archive: { adapter: 'fs', config: { root: '.data/default' }, plugins: () => [versioning()] },
        blob: { adapter: 'fs', config: { root: '.data/files' } },
        custom: { adapter: custom },
    },
    routes: [
        { path: '/gateway/archive', storage: 'archive', operations: ['capabilities', 'list'] },
        {
            path: '/gateway/blob',
            storage: 'blob',
            operations: ['capabilities', 'list', 'upload'],
            authorize: ({ req, event }) => {
                const user = req.headers.get('x-files-user')
                if (!user) throw new Error('Unauthorized')
                event.context.filesUser = user
                return { keyPrefix: `users/${event.context.filesUser}/` }
            },
        },
    ],
})
