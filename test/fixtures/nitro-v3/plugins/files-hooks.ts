import { defineNitroPlugin } from 'nitro/runtime'

// TODO(Nitro upstream): v3's declarations import hookable but omit it from dependencies.

export default defineNitroPlugin((nitroApp) => {
    nitroApp.hooks.hook('files:error', ({ event, storage }) => {
        void event.type
        void storage
    })
})
