import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { configureFiles, useServerFiles } from './runtime/context'
import { FilesRegistry } from './runtime/registry'

/**
 * A structurally compatible Nitro v2/v3 module. Nitro loads this export
 * directly from `modules: ['nuxt-files-sdk/nitro']`.
 */
const nitroFilesModule = {
    name: 'nuxt-files-sdk',
    async setup(nitro: {
        options: { rootDir: string; buildDir: string; dev?: boolean; plugins: string[] }
    }): Promise<void> {
        const directory = resolve(nitro.options.buildDir, 'nuxt-files-sdk')
        const configPath = resolve(nitro.options.rootDir, 'files.config.ts')
        const pluginPath = resolve(directory, 'plugin.mjs')
        await mkdir(directory, { recursive: true })
        await writeFile(
            pluginPath,
            `import config from ${JSON.stringify(configPath)}
import { configureFiles } from 'nuxt-files-sdk'
export default defineNitroPlugin((nitroApp) => configureFiles(config, {
  development: ${JSON.stringify(Boolean(nitro.options.dev))},
  hooks: {
    onAction: (event, storage) => nitroApp.hooks.callHook('files:action', { event, storage }),
    onError: (event, storage) => nitroApp.hooks.callHook('files:error', { event, storage }),
    onRetry: (event, storage) => nitroApp.hooks.callHook('files:retry', { event, storage }),
  },
}))\n`,
        )
        nitro.options.plugins.push(pluginPath)
    },
}

export default nitroFilesModule
export { configureFiles, FilesRegistry, useServerFiles }
export type { FilesRuntimeHooks, StorageRegistry } from './runtime/registry'
