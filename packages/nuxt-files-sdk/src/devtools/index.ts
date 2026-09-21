import { fileURLToPath } from 'node:url'

import { addDevServerHandler, addServerHandler, addServerTemplate } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

import { setupNuxtV3Devtools } from './nuxt-v3'
import uiHandler from './nuxt-v3-handler'
import { setupNuxtV4Devtools } from './nuxt-v4'
import {
    FILES_DEVTOOLS_MAX_UPLOAD_SIZE,
    FILES_DEVTOOLS_PATH,
    FILES_GATEWAY_PATH,
    FILES_SNAPSHOT_PATH,
    FILES_TOKEN_PATH,
} from './snapshot'
import tokenHandler from './token'

const authenticatedHandler = (name: string, path: string, arguments_: string[]): string => {
    const filename = `#nuxt-files-sdk/${name}`
    addServerTemplate({
        filename,
        getContents: () =>
            `import handler from ${JSON.stringify(path.replaceAll('\\', '/'))}\nexport default event => handler(event, ${arguments_.map((value) => JSON.stringify(value)).join(', ')})\n`,
    })
    return filename
}

export const setupFilesDevtools = (nuxt: Nuxt, version: string, write: boolean, secrets: { token: string }): void => {
    // Snapshot must run inside Nitro's worker, where the runtime registry lives.
    addServerHandler({
        route: FILES_SNAPSHOT_PATH,
        handler: authenticatedHandler('snapshot', fileURLToPath(new URL('./snapshot.js', import.meta.url)), [
            secrets.token,
        ]),
    })
    addServerHandler({
        route: FILES_GATEWAY_PATH,
        handler: authenticatedHandler(
            'files',
            fileURLToPath(new URL(write ? './files-write.js' : './files-read.js', import.meta.url)),
            [secrets.token],
        ),
    })
    if (Number.parseInt(version) >= 4) {
        setupNuxtV4Devtools(nuxt, {
            write,
            maxUploadSize: FILES_DEVTOOLS_MAX_UPLOAD_SIZE,
            tokenSecret: secrets.token,
        })
    } else {
        addDevServerHandler({
            route: FILES_TOKEN_PATH,
            handler: (event) =>
                tokenHandler(event, secrets.token, async (token) => {
                    const host = 'devtools' in nuxt ? nuxt.devtools : undefined
                    if (
                        !host ||
                        typeof host !== 'object' ||
                        !('ensureDevAuthToken' in host) ||
                        typeof host.ensureDevAuthToken !== 'function'
                    ) {
                        throw new Error('Nuxt DevTools authentication is unavailable.')
                    }
                    await host.ensureDevAuthToken(token)
                }),
        })
        addDevServerHandler({
            route: FILES_DEVTOOLS_PATH,
            handler: uiHandler,
        })
        setupNuxtV3Devtools(nuxt)
    }
}
