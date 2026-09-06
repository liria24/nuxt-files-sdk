import type { Nuxt } from '@nuxt/schema'

import { FILES_DEVTOOLS_PATH } from './snapshot'

interface CustomTab {
    name: string
    title: string
    icon: string
    view: { type: 'iframe'; src: string }
}

declare module '@nuxt/schema' {
    interface NuxtHooks {
        'devtools:customTabs': (tabs: CustomTab[]) => void
    }
}

export const setupNuxtV3Devtools = (nuxt: Nuxt): void => {
    nuxt.hook('devtools:customTabs', (tabs) => {
        tabs.push({
            name: 'nuxt-files-sdk',
            title: 'Files',
            icon: 'ph:files-duotone',
            view: { type: 'iframe', src: FILES_DEVTOOLS_PATH },
        })
    })
}
