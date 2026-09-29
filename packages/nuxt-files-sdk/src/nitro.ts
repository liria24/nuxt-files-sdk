import { resolve } from 'node:path'

import type { NitroIntegration } from './integration/nitro'

/**
 * A structurally compatible Nitro v2/v3 module. Nitro loads this export
 * directly from `modules: ['nuxt-files-sdk/nitro']`.
 */
export default {
    name: 'nuxt-files-sdk',
    setup: async (nitro: NitroIntegration) => {
        const { setupNitroFilesIntegration } = await import('./integration/nitro')
        return setupNitroFilesIntegration(nitro, {
            configPath: resolve(nitro.options.rootDir, 'files.config.ts'),
            environments: nitro.options.static
                ? ['production', 'prerender']
                : [nitro.options.dev ? 'development' : 'production'],
        })
    },
}
