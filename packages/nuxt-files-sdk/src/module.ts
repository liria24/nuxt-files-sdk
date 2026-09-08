import { resolve } from 'node:path'

import { addImports, addServerImports, defineNuxtModule, getNuxtModuleVersion } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

import { shouldEnableFilesDevtools } from './devtools/enabled'
import { setupNitroFilesIntegration, type NitroIntegration } from './integration/nitro'

declare module '@nuxt/schema' {
    interface NuxtHooks {
        'nitro:init': (nitro: NitroIntegration) => void | Promise<void>
    }
}

/** Options for the Nuxt Files SDK module. */
export interface ModuleOptions {
    /** Path to the Files configuration module, relative to the Nuxt root directory. */
    config: string
    /** Enable Files SDK development diagnostics when Nuxt DevTools is available. */
    devtools: boolean
}

/** Install Files SDK storage configuration, server utilities, Vue composables, and development diagnostics in Nuxt. */
export default defineNuxtModule<ModuleOptions>({
    meta: {
        name: 'nuxt-files-sdk',
        configKey: 'files',
        compatibility: { nuxt: '^4.0.0 || ^5.0.0' },
    },
    defaults: {
        config: 'files.config.ts',
        devtools: true,
    },
    async setup(options, nuxt: Nuxt) {
        const configPath = resolve(nuxt.options.rootDir, options.config)
        nuxt.hook('nitro:init', (nitro) =>
            setupNitroFilesIntegration(nitro, {
                configPath,
                development: nuxt.options.dev,
            }),
        )
        nuxt.hook('prepare:types', ({ references }) => {
            references.push({ path: resolve(nuxt.options.buildDir, 'nuxt-files-sdk/storage-registry.d.ts') })
        })

        addServerImports({ name: 'useServerFiles', from: 'nuxt-files-sdk/runtime' })
        for (const name of ['useFiles', 'useFile', 'useList', 'useSearch']) {
            addImports({ name, from: 'files-sdk/vue' })
        }

        if (shouldEnableFilesDevtools(nuxt.options.dev, options.devtools, nuxt.options.devtools)) {
            const version = await getNuxtModuleVersion('@nuxt/devtools', nuxt)
            const { setupFilesDevtools } = await import('./devtools')
            setupFilesDevtools(nuxt, version || '3')
        }
    },
})

export * from 'files-sdk'
export * from './runtime'
