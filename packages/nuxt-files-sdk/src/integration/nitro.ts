import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ProviderSlug } from 'files-sdk'
import { getProvider, listEnvVars } from 'files-sdk/providers'
import { createJiti } from 'jiti'

import { normalizeFilesConfig } from '../runtime/normalize'

export interface NitroIntegration {
    meta?: { majorVersion?: number }
    options: {
        rootDir: string
        buildDir: string
        dev?: boolean
        preset?: string
        plugins: string[]
        alias?: Record<string, string>
        externals?: { inline?: unknown[] }
    }
    unimport?: {
        injectImports(code: string, id?: string): Promise<{ code: string }>
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
            callback: (types: {
                tsConfig?: {
                    include?: string[]
                    compilerOptions?: { paths?: Record<string, string[]> }
                }
            }) => void | Promise<void>,
        ): void
    }
}

export interface NitroFilesIntegrationOptions {
    configPath: string
    development: boolean
}

const AWS_CORE_DEPENDENCIES = [
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-presigned-post',
    '@aws-sdk/s3-request-presigner',
] as const
const AWS_MULTIPART_DEPENDENCY = '@aws-sdk/lib-storage'
const FETCH_CAPABLE_S3_ADAPTERS = new Set<ProviderSlug>(['minio', 'r2', 'rustfs'])
const WORKERD_PRESETS = new Set(['cloudflare-module', 'cloudflare-durable', 'cloudflare-pages'])

export const optionalAwsSdkDependencies = (
    adapters: ProviderSlug[],
    options: { nitroMajor: number; preset?: string | undefined; resolvable: (dependency: string) => boolean },
): string[] => {
    if (options.nitroMajor >= 3 || !options.preset || !WORKERD_PRESETS.has(options.preset)) return []
    const s3Adapters = adapters.filter((adapter) => getProvider(adapter)?.peerDeps.includes('@aws-sdk/client-s3'))
    if (s3Adapters.length === 0) return []
    const optional = s3Adapters.every((adapter) => FETCH_CAPABLE_S3_ADAPTERS.has(adapter))
        ? [...AWS_CORE_DEPENDENCIES, AWS_MULTIPART_DEPENDENCY]
        : [AWS_MULTIPART_DEPENDENCY]
    return optional.filter((dependency) => !options.resolvable(dependency))
}

const nitroMajorVersion = (nitro: NitroIntegration): number => nitro.meta?.majorVersion ?? ('routing' in nitro ? 3 : 2)

export const selectedAdapters = (
    config: unknown,
    development: boolean,
): { adapters: ProviderSlug[]; single: boolean } | undefined => {
    const entries = normalizeFilesConfig(config, development)
    if (!entries.size) return undefined
    const single = entries.has(undefined)
    const adapters = [...new Set([...entries.values()].map(({ selected }) => selected.adapter))].toSorted()
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
): string => `import type config from ${JSON.stringify(configPath)}
import type { SingleStorage, StorageRegistry } from 'nuxt-files-sdk/runtime'

declare module 'nuxt-files-sdk/runtime' {
  interface NuxtFilesSingleStorage { value: SingleStorage<typeof config> }
  interface NuxtFilesStorageRegistry extends StorageRegistry<typeof config> {}
}
${hookTypes(nitroMajor >= 3 ? 'nitro/types' : 'nitropack/types')}
export {}
`

export const setupNitroFilesIntegration = async (
    nitro: NitroIntegration,
    options: NitroFilesIntegrationOptions,
): Promise<void> => {
    const configPath = options.configPath.replaceAll('\\', '/')
    const jiti = createJiti(import.meta.url, {
        alias: {
            ...nitro.options.alias,
            'nuxt-files-sdk/config': fileURLToPath(new URL('./config.js', import.meta.url)),
        },
        interopDefault: true,
        moduleCache: false,
    })
    const source = await readFile(configPath, 'utf8')
    const code = nitro.unimport ? (await nitro.unimport.injectImports(source, configPath)).code : source
    const loaded: unknown = await jiti.evalModule(code, { filename: configPath, async: true })
    const config: unknown = loaded && typeof loaded === 'object' && 'default' in loaded ? loaded.default : loaded
    const selected = selectedAdapters(config, options.development)
    const directory = resolve(nitro.options.rootDir, nitro.options.buildDir, 'nuxt-files-sdk')
    const typesPath = resolve(directory, 'storage-registry.d.ts')
    let writeRuntime: (() => Promise<void>) | undefined
    const writeTypes = async (): Promise<void> => {
        await mkdir(directory, { recursive: true })
        await writeFile(typesPath, storageTypes(configPath, nitroMajorVersion(nitro)))
    }
    await writeTypes()
    nitro.hooks.hook('types:extend', async (types) => {
        await writeTypes()
        await writeRuntime?.()
        const tsConfig = (types.tsConfig ??= {})
        ;(tsConfig.include ??= []).push(typesPath)
        const paths = ((tsConfig.compilerOptions ??= {}).paths ??= {})
        paths['files-sdk'] ??= [resolve(nitro.options.rootDir, 'node_modules/files-sdk').replaceAll('\\', '/')]
    })
    if (!selected) return
    const { adapters } = selected
    const providers = providerCode(adapters)
    const internalPath = fileURLToPath(new URL('../runtime/internal.js', import.meta.url)).replaceAll('\\', '/')
    const environment = Object.fromEntries(
        adapters.map((adapter) => [
            adapter,
            listEnvVars(adapter).map((variable) => [variable.key, ...(variable.aliases ?? [])]),
        ]),
    )
    const runtimeConfig = options.development ? 'config' : '{ storage: config.storage }'
    const require = createRequire(resolve(nitro.options.rootDir, 'package.json'))
    const aliases = nitro.options.alias ?? {}
    const awsShims = optionalAwsSdkDependencies(adapters, {
        nitroMajor: nitroMajorVersion(nitro),
        preset: nitro.options.preset,
        resolvable: (dependency) => {
            if (Object.hasOwn(aliases, dependency)) return true
            try {
                require.resolve(dependency)
                return true
            } catch {
                return false
            }
        },
    })
    if (awsShims.length > 0) {
        nitro.options.alias = aliases
        await mkdir(directory, { recursive: true })
        await Promise.all(
            awsShims.map(async (dependency) => {
                const shimPath = resolve(directory, `${dependency.replaceAll(/[^a-z0-9]+/giu, '-')}.mjs`)
                aliases[dependency] = shimPath.replaceAll('\\', '/')
                await writeFile(
                    shimPath,
                    `throw new Error(${JSON.stringify(`[nuxt-files-sdk:missing-optional-dependency] ${dependency} is required for this Files SDK operation. Install it or select the provider's fetch client.`)})\n`,
                )
            }),
        )
    }
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
    const pluginPath = resolve(directory, options.development ? 'plugin.dev.mjs' : 'plugin.mjs')
    // Development also externalizes local .mjs files unless explicitly inlined.
    externals.inline.push(pluginPath.replaceAll('\\', '/'), configPath)
    nitro.options.plugins.push(pluginPath.replaceAll('\\', '/'))
    writeRuntime = async (): Promise<void> => {
        await mkdir(directory, { recursive: true })
        await writeFile(
            pluginPath,
            `import config from ${JSON.stringify(configPath)}
${providers.imports}
import { configureFiles } from ${JSON.stringify(internalPath)}

export default (nitroApp) => configureFiles(${runtimeConfig}, {
  development: ${JSON.stringify(options.development)},
  factories: { ${providers.factories} },
  environment: ${JSON.stringify(environment)},
  hooks: {
    onAction: (event, storage) => nitroApp.hooks.callHook('files:action', { event, storage }),
    onError: (event, storage) => nitroApp.hooks.callHook('files:error', { event, storage }),
    onRetry: (event, storage) => nitroApp.hooks.callHook('files:retry', { event, storage }),
  },
})
`,
        )
    }
    await writeRuntime()
}
