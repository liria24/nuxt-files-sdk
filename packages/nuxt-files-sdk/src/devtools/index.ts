import { fileURLToPath } from 'node:url'

import { addDevServerHandler, addServerHandler } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

import { setupNuxtV3Devtools } from './nuxt-v3'
import uiHandler from './nuxt-v3-handler'
import { setupNuxtV4Devtools } from './nuxt-v4'
import { FILES_DEVTOOLS_PATH, FILES_SNAPSHOT_PATH } from './snapshot'

export const setupFilesDevtools = (nuxt: Nuxt, version: string): void => {
    // Snapshot must run inside Nitro's worker, where the runtime registry lives.
    addServerHandler({
        route: FILES_SNAPSHOT_PATH,
        handler: fileURLToPath(new URL('./snapshot.js', import.meta.url)),
    })
    if (Number.parseInt(version) >= 4) {
        setupNuxtV4Devtools(nuxt)
    } else {
        addDevServerHandler({
            route: FILES_DEVTOOLS_PATH,
            handler: uiHandler,
        })
        setupNuxtV3Devtools(nuxt)
    }
}
