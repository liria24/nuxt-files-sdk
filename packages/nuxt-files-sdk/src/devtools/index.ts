import { fileURLToPath } from 'node:url'

import { addDevServerHandler, addServerHandler, addTemplate } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

import {
    FILES_DEVTOOLS_MAX_UPLOAD_SIZE,
    FILES_DEVTOOLS_PATH,
    FILES_GATEWAY_PATH,
    FILES_SNAPSHOT_PATH,
    FILES_TOKEN_PATH,
} from './paths'

const authenticatedHandler = (name: string, path: string, environmentKey: string): string => {
    const template = addTemplate({
        filename: `nuxt-files-sdk/devtools-${name}.mjs`,
        write: true,
        getContents: () =>
            `import { registry } from '#nuxt-files-sdk/registry'\nimport { defineEventHandler } from 'nuxt/server'\nimport handler from ${JSON.stringify(path.replaceAll('\\', '/'))}\nvoid registry\nexport default defineEventHandler(event => handler(event, process.env[${JSON.stringify(environmentKey)}] || ''))\n`,
    })
    return template.dst.replaceAll('\\', '/')
}

export const setupFilesDevtools = async (
    nuxt: Nuxt,
    version: string,
    write: boolean,
    secrets: { token: string; environmentKey: string },
): Promise<void> => {
    // Snapshot must run inside Nitro's worker, where the runtime registry lives.
    addServerHandler({
        route: FILES_SNAPSHOT_PATH,
        handler: {
            nuxt: authenticatedHandler(
                'snapshot',
                fileURLToPath(new URL('./snapshot.js', import.meta.url)),
                secrets.environmentKey,
            ),
        },
    })
    addServerHandler({
        route: FILES_GATEWAY_PATH,
        handler: {
            nuxt: authenticatedHandler(
                'files',
                fileURLToPath(new URL(write ? './files-write.js' : './files-read.js', import.meta.url)),
                secrets.environmentKey,
            ),
        },
    })
    if (Number.parseInt(version) >= 4) {
        const { setupNuxtV4Devtools } = await import('./nuxt-v4')
        setupNuxtV4Devtools(nuxt, {
            write,
            maxUploadSize: FILES_DEVTOOLS_MAX_UPLOAD_SIZE,
            tokenSecret: secrets.token,
        })
    } else {
        const { setupNuxtV3Devtools } = await import('./nuxt-v3')
        const { default: uiHandler } = await import('./nuxt-v3-handler')
        const { default: tokenHandler } = await import('./token')
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
