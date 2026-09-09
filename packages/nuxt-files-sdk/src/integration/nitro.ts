import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { ProviderSlug } from 'files-sdk'
import { getProvider } from 'files-sdk/providers'
import { createJiti } from 'jiti'

import type { FilesConfig, StorageConfig } from '../config'

export interface NitroIntegration {
    meta?: { majorVersion?: number }
    options: {
        rootDir: string
        buildDir: string
        dev?: boolean
        plugins: string[]
        alias?: Record<string, string>
        externals?: { inline?: unknown[] }
    }
    unimport?: {
        getInternalContext(): {
            addons: {
                name?: string
                declaration?: (declarations: string) => string
            }[]
        }
    }
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

const isStorageConfig = (value: unknown): value is StorageConfig =>
    Boolean(value && typeof value === 'object' && 'adapter' in value && typeof value.adapter === 'string')
const isStorageRecord = (value: unknown): value is Record<string, StorageConfig> =>
    Boolean(value && typeof value === 'object' && Object.values(value).every(isStorageConfig))

export const selectedAdapters = (
    config: FilesConfig,
    development: boolean,
): { adapters: ProviderSlug[]; single: boolean } => {
    const storage = config.storage
    const devStorage = config.devStorage
    if (!storage || (!isStorageConfig(storage) && (!isStorageRecord(storage) || Object.keys(storage).length === 0))) {
        throw new Error('[nuxt-files-sdk:invalid-config] At least one storage is required.')
    }
    const selected: StorageConfig[] = []
    const single = isStorageConfig(storage)
    if (single) {
        if (devStorage && !isStorageConfig(devStorage)) {
            throw new Error('[nuxt-files-sdk:invalid-config] A single storage requires a single devStorage override.')
        }
        selected.push(development && isStorageConfig(devStorage) ? devStorage : storage)
    } else {
        if (devStorage && !isStorageRecord(devStorage)) {
            throw new Error('[nuxt-files-sdk:invalid-config] Named storage requires named devStorage overrides.')
        }
        for (const name of Object.keys(devStorage ?? {})) {
            if (!Object.hasOwn(storage, name)) {
                throw new Error(`[nuxt-files-sdk:unknown-storage] Unknown storage "${name}".`)
            }
        }
        for (const [name, namedStorage] of Object.entries(storage)) {
            selected.push(development ? (devStorage?.[name] ?? namedStorage) : namedStorage)
        }
    }
    const adapters = [...new Set(selected.map(({ adapter }) => adapter))].toSorted()
    for (const adapter of adapters) {
        if (!getProvider(adapter)) {
            throw new Error(`[nuxt-files-sdk:unknown-adapter] Unknown adapter "${adapter}".`)
        }
    }
    return { adapters, single }
}

const factoryName = (adapter: ProviderSlug): string =>
    adapter === 'cloudinary'
        ? 'cloudinaryAdapter'
        : adapter.replaceAll(/-([a-z0-9])/gu, (_, character: string) => character.toUpperCase())

export const providerCode = (adapters: ProviderSlug[]): { imports: string; factories: string } => ({
    imports: adapters
        .map(
            (adapter, index) =>
                `import { ${factoryName(adapter)} as provider${index} } from ${JSON.stringify(`files-sdk/${adapter}`)}`,
        )
        .join('\n'),
    factories: adapters.map((adapter, index) => `${JSON.stringify(adapter)}: provider${index}`).join(', '),
})

const hookTypes = (moduleName: 'nitropack/types' | 'nitro/types'): string => `
declare module ${JSON.stringify(moduleName)} {
  interface NitroRuntimeHooks {
    'files:action': (payload: { event: import('files-sdk').FilesActionEvent; storage?: string }) => void | Promise<void>
    'files:error': (payload: { event: import('files-sdk').FilesErrorEvent; storage?: string }) => void | Promise<void>
    'files:retry': (payload: { event: import('files-sdk').FilesRetryEvent; storage?: string }) => void | Promise<void>
  }
}
`

export const storageTypes = (
    configPath: string,
    nitroMajor: number,
    single: boolean,
): string => `import type config from ${JSON.stringify(configPath)}
import type { SingleStorage, StorageRegistry } from 'nuxt-files-sdk/runtime'

declare module 'nuxt-files-sdk/runtime' {
  ${single ? 'interface NuxtFilesSingleStorage { value: SingleStorage<typeof config> }' : 'interface NuxtFilesStorageRegistry extends StorageRegistry<typeof config> {}'}
}
${hookTypes(nitroMajor >= 3 ? 'nitro/types' : 'nitropack/types')}
export {}
`

export const setupNitroFilesIntegration = async (
    nitro: NitroIntegration,
    options: NitroFilesIntegrationOptions,
): Promise<void> => {
    const configPath = options.configPath.replaceAll('\\', '/')
    const config = await createJiti(import.meta.url, {
        ...(nitro.options.alias ? { alias: nitro.options.alias } : {}),
        interopDefault: true,
        moduleCache: false,
    }).import<FilesConfig>(configPath, { default: true })
    const { adapters, single } = selectedAdapters(config, options.development)
    const providers = providerCode(adapters)
    nitro.unimport?.getInternalContext().addons.push({
        name: 'nuxt-files-sdk-jsdoc',
        declaration: (declarations) =>
            declarations.replace(
                /^(\s*)(const useServerFiles: typeof .*\.useServerFiles)$/mu,
                "$1/** Return the project's Files client, including its configured plugin extensions. */\n$1const useServerFiles: typeof import('nuxt-files-sdk/runtime').useServerFiles",
            ),
    })
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
${providers.imports}
import { configureFiles } from 'nuxt-files-sdk/runtime'

export default (nitroApp) => configureFiles(config, {
  development: ${JSON.stringify(options.development)},
  factories: { ${providers.factories} },
  hooks: {
    onAction: (event, storage) => nitroApp.hooks.callHook('files:action', { event, storage }),
    onError: (event, storage) => nitroApp.hooks.callHook('files:error', { event, storage }),
    onRetry: (event, storage) => nitroApp.hooks.callHook('files:retry', { event, storage }),
  },
})
`,
            ),
            // Older v2 and current v3 omit meta; only v3 exposes the routing API.
            writeFile(
                typesPath,
                storageTypes(configPath, nitro.meta?.majorVersion ?? ('routing' in nitro ? 3 : 2), single),
            ),
        ])
        types.tsConfig?.include?.push(typesPath)
    })
}
