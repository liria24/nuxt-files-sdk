import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

import {
    addComponent,
    addComponentsDir,
    addImports,
    addPlugin,
    addServerImports,
    createResolver,
    defineNuxtModule,
    getNuxtModuleVersion,
    hasNuxtModule,
    updateAppConfig,
} from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

import { filesDevtoolsWriteEnabled, shouldEnableFilesDevtools, type FilesDevtoolsOptions } from './devtools/enabled'
import { setupNitroFilesIntegration, type NitroIntegration } from './integration/nitro'
import { defaultFilesIcons } from './ui/icons'

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
    /** Register the Files SDK Vue UI and Nuxt UI integration. */
    ui: boolean
}

export type FilesUiAppConfig = Partial<Record<keyof typeof import('./ui/runtime/themes').filesThemes, object>> & {
    files?: { icons?: Partial<Record<keyof typeof defaultFilesIcons, string>> }
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
        ui: true,
    },
    moduleDependencies(nuxt) {
        const options = (nuxt.options as typeof nuxt.options & { files?: Partial<ModuleOptions> }).files
        return options?.ui === false ? {} : { '@nuxt/icon': {} }
    },
    async setup(options, nuxt: Nuxt) {
        const resolver = createResolver(import.meta.url)
        const configPath = resolve(nuxt.options.rootDir, options.config)
        ;(nuxt.options.typescript.tsConfig.include ??= []).push(configPath)
        const paths = ((nuxt.options.typescript.tsConfig.compilerOptions ??= {}).paths ??= {})
        paths['files-sdk'] ??= [resolve(nuxt.options.rootDir, 'node_modules/files-sdk').replaceAll('\\', '/')]
        nuxt.hook('nitro:init', (nitro) =>
            setupNitroFilesIntegration(nitro, {
                configPath,
                development: nuxt.options.dev,
            }),
        )
        nuxt.hook('prepare:types', ({ references }) => {
            references.push({ path: resolve(nuxt.options.buildDir, 'nuxt-files-sdk/storage-registry.d.ts') })
        })

        addServerImports([
            { name: 'defineFilesConfig', from: 'nuxt-files-sdk/config' },
            { name: 'useServerFiles', from: 'nuxt-files-sdk/runtime' },
        ])
        addImports({ name: 'defineFilesConfig', from: 'nuxt-files-sdk/config' })
        for (const name of ['useFiles', 'useFile', 'useList', 'useSearch']) {
            addImports({ name, from: 'files-sdk/vue' })
        }

        if (options.ui) {
            const { filesThemes } = await import('./ui/runtime/themes')
            const filesUiRegistry = Object.entries(filesThemes)
                .map(([name, theme]) => `export const ${name} = ${JSON.stringify(theme)} as const`)
                .join('\n')
            const nuxtUi = hasNuxtModule('@nuxt/ui')
            if (nuxtUi) {
                const uiOptions = (
                    nuxt.options as typeof nuxt.options & {
                        ui?: { experimental?: { componentDetection?: boolean | string[] } }
                    }
                ).ui
                const experimental = uiOptions?.experimental
                const detection = experimental?.componentDetection
                if (detection) {
                    experimental.componentDetection = [
                        ...new Set([
                            ...(Array.isArray(detection) ? detection : []),
                            'Button',
                            'Input',
                            'Select',
                            'Checkbox',
                            'Progress',
                        ]),
                    ]
                }
            }
            for (const control of ['Button', 'Input', 'Select', 'Checkbox', 'Progress']) {
                addComponent({
                    name: `FilesControl${control}`,
                    filePath: resolver.resolve(`./ui/controls/${nuxtUi ? 'nuxt-ui' : 'standalone'}/${control}.vue`),
                })
            }
            if (nuxtUi) {
                addComponent({
                    name: 'UTheme',
                    filePath: resolver.resolve('./ui/integration/UTheme.vue'),
                    global: true,
                    priority: 10,
                })
            } else {
                nuxt.hook('vite:extend', async ({ config }) => {
                    const tailwind = await import('@tailwindcss/vite').then((module) => module.default)
                    ;(config.plugins ??= []).push(tailwind())
                })
                if (nuxt.options.builder !== '@nuxt/vite-builder') {
                    nuxt.options.postcss.plugins['@tailwindcss/postcss'] = {}
                }
            }
            addPlugin(resolver.resolve(nuxtUi ? './ui/runtime/nuxt-ui-plugin' : './ui/runtime/nuxt-plugin'))
            addComponentsDir({
                path: resolver.resolve('./ui/components'),
                pathPrefix: false,
            })
            nuxt.options.css.push(resolver.resolve(nuxtUi ? './ui/styles.css' : './ui/styles.standalone.css'))
            updateAppConfig({ ui: { files: { icons: defaultFilesIcons } } })

            nuxt.hook('modules:done', () => {
                for (const template of nuxt.options.build.templates) {
                    const getContents = template.getContents
                    if (!getContents) continue
                    if (template.filename === 'ui/index.ts') {
                        template.getContents = async (context) => `${await getContents(context)}\n${filesUiRegistry}\n`
                    }
                    if (template.filename === 'types/ui.d.ts') {
                        template.getContents = async (context) => {
                            const contents = (await getContents(context)).replace(
                                'type AppConfigUI = {',
                                "import type { FilesUiAppConfig } from 'nuxt-files-sdk'\n\ntype AppConfigUI = FilesUiAppConfig & {",
                            )
                            return contents
                        }
                    }
                }
            })
        }

        if (shouldEnableFilesDevtools(nuxt.options.dev, options.devtools, nuxt.options.devtools)) {
            const version = await getNuxtModuleVersion('@nuxt/devtools', nuxt)
            const { setupFilesDevtools } = await import('./devtools')
            const secrets = { token: randomUUID() }
            setupFilesDevtools(nuxt, version || '3', filesDevtoolsWriteEnabled(options.devtools), secrets)
        }
    },
})

export type { FilesDevtoolsOptions } from './devtools/enabled'
export type { FilesUiProps } from './ui/runtime/theme'
export type {
    FilesActionControls,
    FilesButtonOptions,
    FilesCheckboxOptions,
    FilesInputOptions,
    FilesMenuItemOptions,
    FilesProgressOptions,
    FilesSelectOptions,
    FilesThemeProps,
} from './ui/runtime/control-options'
