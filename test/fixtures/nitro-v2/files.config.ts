import { versioning } from 'files-sdk/versioning'
import { defineFilesConfig } from 'nuxt-files-sdk/config'

export default defineFilesConfig({
    storage: { adapter: 'fs', config: { root: '.data/files' }, plugins: [versioning()] },
    routes: [
        {
            path: '/gateway',
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
