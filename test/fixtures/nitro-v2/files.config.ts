import { defineFilesConfig } from 'nuxt-files-sdk/config'

import { versioning } from '#files-sdk/versioning'

const { storage } = await import('./storage')

export default defineFilesConfig({
    storage: { ...storage, plugins: [versioning()] },
    routes: [
        {
            path: '/gateway',
            operations: ['capabilities', 'list', 'head', 'download', 'upload'],
            maxUploadSize: 10,
            authorize: ({ req, event }) => {
                const user = req.headers.get('x-files-user')
                if (!user) throw new Error('Unauthorized')
                event.context.filesUser = user
                return { keyPrefix: `users/${event.context.filesUser}/` }
            },
        },
    ],
})
