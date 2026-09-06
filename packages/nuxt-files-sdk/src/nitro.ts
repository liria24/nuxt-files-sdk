import { resolve } from 'node:path'

import { setupNitroFilesIntegration, type NitroIntegration } from './integration/nitro'

/**
 * A structurally compatible Nitro v2/v3 module. Nitro loads this export
 * directly from `modules: ['nuxt-files-sdk/nitro']`.
 */
export default {
    name: 'nuxt-files-sdk',
    setup: (nitro: NitroIntegration) =>
        setupNitroFilesIntegration(nitro, {
            configPath: resolve(nitro.options.rootDir, 'files.config.ts'),
            development: Boolean(nitro.options.dev),
        }),
}

export * from './runtime'
