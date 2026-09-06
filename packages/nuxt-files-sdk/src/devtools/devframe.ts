import { fileURLToPath } from 'node:url'

import { defineDevframe } from 'devframe'

import { FILES_DEVTOOLS_PATH } from './snapshot'

export default defineDevframe({
    id: 'nuxt-files-sdk',
    name: 'Files',
    version: '0.0.1',
    packageName: 'nuxt-files-sdk',
    importMetaUrl: import.meta.url,
    homepage: 'https://github.com/liria24/nuxt-files-sdk',
    description: 'Files SDK storage and integration diagnostics for Nuxt.',
    icon: 'ph:files-duotone',
    basePath: FILES_DEVTOOLS_PATH,
    cli: { distDir: fileURLToPath(new URL('./client', import.meta.url)) },
    setup(context) {
        context.views.hostStatic(FILES_DEVTOOLS_PATH, fileURLToPath(new URL('./client', import.meta.url)))
    },
})
