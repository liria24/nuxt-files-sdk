import type { Nuxt } from '@nuxt/schema'
import { createEmbedded } from 'devframe/adapters/embedded'

import filesDevframe from './devframe'
import { FILES_DEVTOOLS_PATH } from './snapshot'

type DevtoolsContext = Parameters<typeof createEmbedded>[1]['ctx'] & {
    docks: {
        register(entry: {
            id: string
            title: string
            icon: string
            type: 'iframe'
            url: string
            groupId: string
        }): unknown
    }
}

declare module '@nuxt/schema' {
    interface NuxtHooks {
        'devtools:ready': (context: DevtoolsContext) => void | Promise<void>
    }
}

export const setupNuxtV4Devtools = (nuxt: Nuxt): void => {
    nuxt.hook('devtools:ready', async (context) => {
        await createEmbedded(filesDevframe, { ctx: context })
        context.docks.register({
            id: 'nuxt-files-sdk',
            title: 'Files',
            icon: 'ph:files-duotone',
            type: 'iframe',
            url: FILES_DEVTOOLS_PATH,
            groupId: 'nuxt',
        })
    })
}
