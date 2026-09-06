export default defineNitroPlugin((nitroApp) => {
    nitroApp.hooks.hook('files:action', ({ event, storage }) => {
        void event.type
        void storage
    })
})
