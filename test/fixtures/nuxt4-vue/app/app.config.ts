export default defineAppConfig({
    ui: {
        files: { icons: { upload: 'i-lucide-cloud-upload' } },
        filesDropzone: {
            slots: { root: 'fixture-dropzone' },
            variants: { size: { sm: { root: 'fixture-small' } } },
            compoundVariants: [{ color: 'primary', variant: 'outline', class: { root: 'fixture-primary-outline' } }],
            defaultVariants: { size: 'sm' },
        },
    },
})
