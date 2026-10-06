import { createHash, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

import {
    addImports,
    addServerImports,
    defineNuxtModule,
    getNuxtModuleVersion,
    resolveModule,
    resolveServerVariant,
    useLogger,
} from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

import { filesDevtoolsWriteEnabled, shouldEnableFilesDevtools, type FilesDevtoolsOptions } from './devtools/enabled'
import { filesBuilderCapabilities } from './integration/capabilities'
import { moduleMeta } from './meta'

/** Options for the Nuxt Files SDK module. */
export interface ModuleOptions {
    /** Path to the Files configuration module, relative to the Nuxt root directory. */
    config: string
    /** Enable Files SDK development tools. File writes are enabled unless explicitly disabled. */
    devtools: boolean | FilesDevtoolsOptions
}

/** Install Files SDK storage configuration, server utilities, Vue composables, and development diagnostics in Nuxt. */
export default defineNuxtModule<ModuleOptions>({
    meta: moduleMeta,
    defaults: {
        config: 'files.config.ts',
        devtools: true,
    },
    setup(options, nuxt: Nuxt) {
        // Prepare after module aliases are complete, independently of any server runtime startup.
        nuxt.hook('modules:done', () =>
            nuxt.runWithContext(async () => {
                const { setupNuxtFilesIntegration } = await import('./integration/nuxt')
                const configPath = resolve(nuxt.options.rootDir, options.config)
                const active = await setupNuxtFilesIntegration(nuxt, { configPath })
                if (!active) return
                const capabilities = filesBuilderCapabilities(
                    resolveServerVariant<'nuxt' | 'nitro2' | 'nitro3'>({
                        nuxt: 'nuxt',
                        nitro2: 'nitro2',
                        nitro3: 'nitro3',
                    }),
                )

                addServerImports([
                    {
                        name: 'defineFilesConfig',
                        from: 'nuxt-files-sdk/config',
                        typeFrom: resolveModule('nuxt-files-sdk/config', { url: new URL(import.meta.url) }).replaceAll(
                            '\\',
                            '/',
                        ),
                    },
                    { name: 'useServerFiles', from: 'nuxt-files-sdk/runtime', dtsDisabled: true },
                    { name: 'syncFiles', from: 'nuxt-files-sdk/runtime', dtsDisabled: true },
                    { name: 'transferFiles', from: 'nuxt-files-sdk/runtime', dtsDisabled: true },
                ])
                addImports({ name: 'defineFilesConfig', from: 'nuxt-files-sdk/config' })
                for (const name of ['useFiles', 'useFile', 'useList', 'useSearch']) {
                    addImports({ name, from: '#files-sdk/vue' })
                }

                if (shouldEnableFilesDevtools(nuxt.options.dev, options.devtools, nuxt.options.devtools)) {
                    if (!capabilities.devtools) {
                        useLogger('nuxt-files-sdk').warn(
                            '[nuxt-files-sdk:devtools-unavailable] Files DevTools is unavailable with this server builder. Basic Files runtime remains enabled.',
                        )
                        return
                    }
                    // Native DevTools has been installed by the end of the module phase.
                    const version = await getNuxtModuleVersion('@nuxt/devtools', nuxt)
                    const { setupFilesDevtools } = await import('./devtools')
                    const environmentKey = `NUXT_FILES_DEVTOOLS_${createHash('sha256').update(nuxt.options.rootDir).digest('hex').slice(0, 24).toUpperCase()}`
                    const previous = process.env[environmentKey]
                    const secrets = { token: randomUUID(), environmentKey }
                    process.env[environmentKey] = secrets.token
                    const restore = () => {
                        if (process.env[environmentKey] !== secrets.token) return
                        if (previous === undefined) delete process.env[environmentKey]
                        else process.env[environmentKey] = previous
                    }
                    nuxt.hook('close', restore)
                    try {
                        await setupFilesDevtools(
                            nuxt,
                            version || '3',
                            filesDevtoolsWriteEnabled(options.devtools),
                            secrets,
                        )
                    } catch (error) {
                        restore()
                        throw error
                    }
                }
            }),
        )
    },
})

export type { FilesDevtoolsOptions } from './devtools/enabled'
