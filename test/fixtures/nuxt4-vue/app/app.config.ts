export default defineAppConfig({
    ui: {
        files: { icons: { upload: 'i-lucide-cloud-upload' } },
        filesDropzone: {
            slots: { root: 'fixture-dropzone' },
        },
    },
})
