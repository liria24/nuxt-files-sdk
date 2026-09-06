import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export interface NitroIntegration {
    meta?: { majorVersion?: number }
    options: { rootDir: string; buildDir: string; dev?: boolean; plugins: string[]; externals?: { inline?: unknown[] } }
    hooks: {
        hook(
            name: 'types:extend',
            callback: (types: { tsConfig?: { include?: string[] } }) => void | Promise<void>,
        ): void
    }
}

export interface NitroFilesIntegrationOptions {
    configPath: string
    development: boolean
}

const hookTypes = (moduleName: 'nitropack/types' | 'nitro/types'): string => `
declare module ${JSON.stringify(moduleName)} {
  interface NitroRuntimeHooks {
    'files:action': (payload: { event: import('files-sdk').FilesActionEvent; storage: string }) => void | Promise<void>
    'files:error': (payload: { event: import('files-sdk').FilesErrorEvent; storage: string }) => void | Promise<void>
    'files:retry': (payload: { event: import('files-sdk').FilesRetryEvent; storage: string }) => void | Promise<void>
  }
}
`

export const storageTypes = (
    configPath: string,
    nitroMajor: number,
): string => `import type config from ${JSON.stringify(configPath)}
import type { DefaultStorage, StorageRegistry } from 'nuxt-files-sdk/runtime'

declare module 'nuxt-files-sdk/runtime' {
  interface NuxtFilesStorageRegistry extends StorageRegistry<typeof config> {}
  interface NuxtFilesDefaultStorage { value: DefaultStorage<typeof config> }
}
${hookTypes(nitroMajor >= 3 ? 'nitro/types' : 'nitropack/types')}
export {}
`

export const setupNitroFilesIntegration = async (
    nitro: NitroIntegration,
    options: NitroFilesIntegrationOptions,
): Promise<void> => {
    const configPath = options.configPath.replaceAll('\\', '/')
    // Inline both packages so installed consumers also tree-shake the plugin barrel.
    const externals = (nitro.options.externals ??= {})
    ;(externals.inline ??= []).push('nuxt-files-sdk')
    // Nitro's single-file dev build would eagerly import every native provider SDK.
    if (!nitro.options.dev) externals.inline.push('files-sdk')
    const directory = resolve(nitro.options.buildDir, 'nuxt-files-sdk')
    const pluginPath = resolve(directory, 'plugin.mjs')
    const typesPath = resolve(directory, 'storage-registry.d.ts')
    // Development also externalizes local .mjs files unless explicitly inlined.
    externals.inline.push(pluginPath.replaceAll('\\', '/'), configPath)
    nitro.options.plugins.push(pluginPath.replaceAll('\\', '/'))
    nitro.hooks.hook('types:extend', async (types) => {
        await mkdir(directory, { recursive: true })
        await Promise.all([
            writeFile(
                pluginPath,
                `import config from ${JSON.stringify(configPath)}
import { configureFiles } from 'nuxt-files-sdk/runtime'

export default (nitroApp) => configureFiles(config, {
  development: ${JSON.stringify(options.development)},
  hooks: {
    onAction: (event, storage) => nitroApp.hooks.callHook('files:action', { event, storage }),
    onError: (event, storage) => nitroApp.hooks.callHook('files:error', { event, storage }),
    onRetry: (event, storage) => nitroApp.hooks.callHook('files:retry', { event, storage }),
  },
})
`,
            ),
            // Older v2 and current v3 omit meta; only v3 exposes the routing API.
            writeFile(typesPath, storageTypes(configPath, nitro.meta?.majorVersion ?? ('routing' in nitro ? 3 : 2))),
        ])
        types.tsConfig?.include?.push(typesPath)
    })
}
