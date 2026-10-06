import type { R2Bucket } from '#files-sdk/r2'

const runtimeBinding = (): R2Bucket => {
    throw new Error('The runtime-only Cloudflare binding was evaluated during build.')
}

export default defineFilesConfig({
    storage: {
        adapter: 'r2',
        config: () => ({ binding: runtimeBinding(), publicBaseUrl: 'https://files.example' }),
    },
    $development: { storage: { adapter: 'fs', config: { root: '.data/files' } } },
})
