import { NUXT_DEVTOOLS_GROUP_ID, onDevtoolsReady } from '@nuxt/devtools-kit'
import type { Nuxt } from '@nuxt/schema'
import { createEmbedded } from 'devframe/adapters/embedded'

import { createFilesDevframe } from './devframe'
import { FILES_DEVTOOLS_PATH } from './snapshot'

export const setupNuxtV4Devtools = (
    nuxt: Nuxt,
    options: { write: boolean; maxUploadSize: number; tokenSecret: string },
): void => {
    onDevtoolsReady(async (context) => {
        await createEmbedded(
            createFilesDevframe({
                ...options,
                notifyFailure: (message) => context.messages.add(message),
            }),
            { ctx: context },
        )
        context.docks.register({
            id: 'nuxt-files-sdk',
            title: 'Files',
            icon: 'ph:files-duotone',
            type: 'iframe',
            url: FILES_DEVTOOLS_PATH,
            groupId: NUXT_DEVTOOLS_GROUP_ID,
        })

        const broadcast = (method: 'refresh' | 'copy-diagnostics') =>
            context.scope('nuxt-files-sdk').rpc.broadcast({ method, args: [], optional: true, event: true })
        context.commands.register({
            id: 'nuxt-files-sdk:open',
            title: 'Files: Open',
            icon: 'ph:files-duotone',
            category: 'tools',
            handler: () => context.docks.activate('nuxt-files-sdk'),
        })
        context.commands.register({
            id: 'nuxt-files-sdk:refresh',
            title: 'Files: Refresh',
            icon: 'ph:arrow-clockwise-duotone',
            category: 'tools',
            handler: () => broadcast('refresh'),
        })
        context.commands.register({
            id: 'nuxt-files-sdk:copy-diagnostics',
            title: 'Files: Copy Diagnostics',
            icon: 'ph:copy-duotone',
            category: 'tools',
            handler: () => broadcast('copy-diagnostics'),
        })
    }, nuxt)
}
