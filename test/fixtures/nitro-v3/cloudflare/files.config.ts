import { defineFilesConfig } from 'nuxt-files-sdk/config'

import type { R2Bucket } from '#files-sdk/r2'

export default defineFilesConfig({
    storage: {
        minio: { adapter: 'minio', config: { bucket: 'test', endpoint: 'https://storage.example' } },
        r2: { adapter: 'r2', config: { bucket: 'test', endpoint: 'https://storage.example', client: 'fetch' } },
        binding: { adapter: 'r2', config: () => ({ binding: {} as R2Bucket }) },
        rustfs: { adapter: 'rustfs', config: { bucket: 'test', endpoint: 'https://storage.example' } },
    },
})
