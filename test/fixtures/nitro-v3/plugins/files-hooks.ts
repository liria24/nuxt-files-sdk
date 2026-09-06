import { defineNitroPlugin } from 'nitro/runtime'

export default defineNitroPlugin((nitroApp) => {
    nitroApp.hooks.hook('files:error', ({ event, storage }) => {
        void event.type
        void storage
    })
})
