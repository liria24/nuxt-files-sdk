import { defineFilesConfig } from 'nuxt-files-sdk/config'

export default defineFilesConfig({
    storage: {
        minio: { adapter: 'minio', config: { bucket: 'test', endpoint: 'https://storage.example' } },
        r2: { adapter: 'r2', config: { bucket: 'test', endpoint: 'https://storage.example' } },
        rustfs: { adapter: 'rustfs', config: { bucket: 'test', endpoint: 'https://storage.example' } },
    },
})
