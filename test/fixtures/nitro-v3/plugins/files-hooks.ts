import { definePlugin as defineNitroPlugin } from 'nitro'

export default defineNitroPlugin((nitroApp) => {
    nitroApp.hooks.hook('files:error', ({ event, storage }) => {
        void event.type
        void storage
    })
})
