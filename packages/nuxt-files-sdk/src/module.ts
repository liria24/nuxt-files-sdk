import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

import { addImports, addServerImports, defineNuxtModule, getNuxtModuleVersion } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

import { filesDevtoolsWriteEnabled, shouldEnableFilesDevtools, type FilesDevtoolsOptions } from './devtools/enabled'
import type { NitroIntegration } from './integration/nitro'

declare module '@nuxt/schema' {
    interface NuxtHooks {
        'nitro:init': (nitro: NitroIntegration) => void | Promise<void>
    }
}

/** Options for the Nuxt Files SDK module. */
export interface ModuleOptions {
    /** Path to the Files configuration module, relative to the Nuxt root directory. */
    config: string
    /** Enable Files SDK development tools. File writes are enabled unless explicitly disabled. */
    devtools: boolean | FilesDevtoolsOptions
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
        const { registerSdkAliases, resolveOwnedSdk, sdkTypePaths } = await import('./integration/resolve')
        const configPath = resolve(nuxt.options.rootDir, options.config)
        const sdk = resolveOwnedSdk()
        nuxt.options.alias = registerSdkAliases(nuxt.options.alias, sdk, ['browser', 'import'])
        ;(nuxt.options.typescript.tsConfig.include ??= []).push(configPath)
        const paths = ((nuxt.options.typescript.tsConfig.compilerOptions ??= {}).paths ??= {})
        Object.assign(paths, sdkTypePaths(sdk))
        let active = false
        nuxt.hook('nitro:init', async (nitro) => {
            const { setupNitroFilesIntegration } = await import('./integration/nitro')
            active = await setupNitroFilesIntegration(nitro, {
                configPath,
                restart: () => nuxt.callHook('restart'),
                environments: nitro.options.static
                    ? ['production', 'prerender']
                    : [nuxt.options.envName || (nuxt.options.dev ? 'development' : 'production')],
            })
        })
        nuxt.hook('prepare:types', ({ references }) => {
            if (active)
                references.push({ path: resolve(nuxt.options.buildDir, 'nuxt-files-sdk/storage-registry.d.ts') })
        })

        addServerImports([
            { name: 'defineFilesConfig', from: 'nuxt-files-sdk/config' },
            { name: 'useServerFiles', from: 'nuxt-files-sdk/runtime' },
            { name: 'syncFiles', from: 'nuxt-files-sdk/runtime' },
            { name: 'transferFiles', from: 'nuxt-files-sdk/runtime' },
        ])
        addImports({ name: 'defineFilesConfig', from: 'nuxt-files-sdk/config' })
        for (const name of ['useFiles', 'useFile', 'useList', 'useSearch']) {
            addImports({ name, from: '#files-sdk/vue' })
        }

        if (shouldEnableFilesDevtools(nuxt.options.dev, options.devtools, nuxt.options.devtools)) {
            const version = await getNuxtModuleVersion('@nuxt/devtools', nuxt)
            const { setupFilesDevtools } = await import('./devtools')
            const secrets = { token: randomUUID() }
            await setupFilesDevtools(nuxt, version || '3', filesDevtoolsWriteEnabled(options.devtools), secrets)
        }
    },
})

export type { FilesDevtoolsOptions } from './devtools/enabled'
