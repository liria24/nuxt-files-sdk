import type { Nuxt } from '@nuxt/schema'

import { FILES_DEVTOOLS_PATH } from './snapshot'

export const setupNuxtV3Devtools = (nuxt: Nuxt): void => {
    nuxt.hook('devtools:customTabs', (tabs) => {
        tabs.push({
            name: 'nuxt-files-sdk',
            title: 'Files',
            icon: 'ph:files-duotone',
            view: { type: 'iframe', src: `${FILES_DEVTOOLS_PATH}?host=nuxt-v3` },
        })
    })
}
