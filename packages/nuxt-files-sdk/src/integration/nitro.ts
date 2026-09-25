import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ProviderSlug } from 'files-sdk'
import { getProvider, listEnvVars } from 'files-sdk/providers'

import { loadFilesConfig } from '../config/load'
import { pruneFilesConfigSource } from '../config/prune'
import { normalizeFilesConfig } from '../runtime/normalize'

export interface NitroIntegration {
    meta?: { majorVersion?: number }
    options: {
        rootDir: string
        buildDir: string
        dev?: boolean
        static?: boolean
        preset?: string
        plugins: string[]
        handlers?: { route: string; handler: string }[]
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
    environments: readonly string[]
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

export const selectedAdapters = (config: unknown): { adapters: ProviderSlug[]; single: boolean } => {
    const entries = normalizeFilesConfig(config)
    const single = entries.has(undefined)
    const adapters = [
        ...new Set(
            [...entries.values()]
                .map(({ storage }) => storage.adapter)
                .filter((adapter): adapter is ProviderSlug => typeof adapter === 'string'),
        ),
    ].toSorted()
    for (const adapter of adapters) {
        if (!getProvider(adapter)) {
            throw new Error(`[nuxt-files-sdk:unknown-adapter] Unknown adapter "${adapter}".`)
        }
    }
    return { adapters, single }
}

export const gatewayRoutes = (config: unknown): { path: string; storage?: string }[] => {
    const routes = config && typeof config === 'object' && 'routes' in config ? config.routes : undefined
    if (routes === undefined) return []
    if (!Array.isArray(routes)) throw new Error('[nuxt-files-sdk:invalid-route] routes must be an array.')
    const storages = normalizeFilesConfig(config)
    const paths = new Set<string>()
    const selected: { path: string; storage?: string }[] = []
    for (const route of routes as unknown[]) {
        if (
            !route ||
            typeof route !== 'object' ||
            !('path' in route) ||
            typeof route.path !== 'string' ||
            !/^\/(?:[\w.~-]+(?:\/[\w.~-]+)*)?$/u.test(route.path)
        ) {
            throw new Error('[nuxt-files-sdk:invalid-route] Each route needs a static absolute path.')
        }
        if (paths.has(route.path)) throw new Error(`[nuxt-files-sdk:duplicate-route] Duplicate route "${route.path}".`)
        paths.add(route.path)
        const name = 'storage' in route ? route.storage : undefined
        if (storages.has(undefined) ? name !== undefined : typeof name !== 'string' || !storages.has(name)) {
            throw new Error(`[nuxt-files-sdk:unknown-storage] Invalid storage for route "${route.path}".`)
        }
        selected.push(typeof name === 'string' ? { path: route.path, storage: name } : { path: route.path })
    }
    return selected
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
    const config = await loadFilesConfig({
        configPath,
        environments: options.environments,
        alias: nitro.options.alias,
        injectImports: nitro.unimport?.injectImports.bind(nitro.unimport),
    })
    const selected = selectedAdapters(config)
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
    const routes = gatewayRoutes(config)
    const { adapters } = selected
    const providers = providerCode(adapters)
    const internalPath = fileURLToPath(new URL('../runtime/internal.js', import.meta.url)).replaceAll('\\', '/')
    const environment = Object.fromEntries(
        adapters.map((adapter) => [
            adapter,
            listEnvVars(adapter)
                .filter((variable) => variable.readBy === 'files-sdk')
                .map((variable) => [variable.key, ...(variable.aliases ?? [])]),
        ]),
    )
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
    const shimFiles = awsShims.map((dependency) => ({
        dependency,
        path: resolve(directory, `${dependency.replaceAll(/[^a-z0-9]+/giu, '-')}.mjs`),
    }))
    if (shimFiles.length > 0) {
        nitro.options.alias = aliases
        for (const { dependency, path } of shimFiles) aliases[dependency] = path.replaceAll('\\', '/')
    }
    nitro.unimport?.getInternalContext().addons.push({
        name: 'nuxt-files-sdk-jsdoc',
        declaration: (declarations) =>
            declarations.replace(
                /^([ \t]*)const (useServerFiles|syncFiles|transferFiles): typeof .*\.\2$/gmu,
                (_, indent: string, name: string) =>
                    `${name === 'useServerFiles' ? `${indent}/** Return the project's Files client, including its configured plugin extensions. */\n` : ''}${indent}const ${name}: typeof import('nuxt-files-sdk/runtime').${name}`,
            ),
    })
    // Inline both packages so installed consumers also tree-shake the plugin barrel.
    const externals = (nitro.options.externals ??= {})
    ;(externals.inline ??= []).push('nuxt-files-sdk')
    // Nitro's single-file dev build would eagerly import every native provider SDK.
    if (!nitro.options.dev) externals.inline.push('files-sdk')
    const pluginPath = resolve(directory, nitro.options.dev ? 'plugin.dev.mjs' : 'plugin.mjs')
    const resolvedPath = resolve(directory, nitro.options.dev ? 'resolved.dev.mjs' : 'resolved.mjs')
    const selectedPath = resolve(directory, nitro.options.dev ? 'selected.dev.ts' : 'selected.ts')
    const routePaths = routes.map((_, index) =>
        resolve(directory, `gateway-${index}${nitro.options.dev ? '.dev' : ''}.mjs`).replaceAll('\\', '/'),
    )
    for (const [index, route] of routes.entries()) {
        ;(nitro.options.handlers ??= []).push({ route: route.path, handler: routePaths[index]! })
    }
    // Development also externalizes local .mjs files unless explicitly inlined.
    externals.inline.push(
        pluginPath.replaceAll('\\', '/'),
        resolvedPath.replaceAll('\\', '/'),
        selectedPath.replaceAll('\\', '/'),
        ...routePaths,
    )
    nitro.options.plugins.push(pluginPath.replaceAll('\\', '/'))
    writeRuntime = async (): Promise<void> => {
        await mkdir(directory, { recursive: true })
        await Promise.all(
            shimFiles.map(({ dependency, path }) =>
                writeFile(
                    path,
                    `throw new Error(${JSON.stringify(`[nuxt-files-sdk:missing-optional-dependency] ${dependency} is required for this Files SDK operation. Install it or select the provider's fetch client.`)})\n`,
                ),
            ),
        )
        const originalSource = await readFile(configPath, 'utf8')
        const importedSource = nitro.unimport
            ? (await nitro.unimport.injectImports(originalSource, configPath)).code
            : originalSource
        await writeFile(selectedPath, pruneFilesConfigSource(importedSource, configPath, options.environments))
        const mergePath = fileURLToPath(new URL('../config/merge.js', import.meta.url)).replaceAll('\\', '/')
        const selectedBranches = options.environments
            .flatMap((name) => [`raw[${JSON.stringify(`$${name}`)}]`, `raw.$env?.[${JSON.stringify(name)}]`])
            .toReversed()
        await writeFile(
            resolvedPath,
            `import raw from ${JSON.stringify(selectedPath.replaceAll('\\', '/'))}\nimport { mergeFilesConfig } from ${JSON.stringify(mergePath)}\nconst resolved = mergeFilesConfig(${[...selectedBranches, 'raw'].join(', ')})\nexport default { storage: resolved.storage, routes: resolved.routes }\n`,
        )
        await writeFile(
            pluginPath,
            `import config from ${JSON.stringify(resolvedPath.replaceAll('\\', '/'))}
${providers.imports}
import { configureFiles } from ${JSON.stringify(internalPath)}

export default (nitroApp) => configureFiles(config, {
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
        await Promise.all(
            routePaths.map((path, index) => {
                const route = routes[index]!
                const handler =
                    nitroMajorVersion(nitro) >= 3 ? 'router.handle(event.req)' : 'createRouteHandler(router)(event)'
                return writeFile(
                    path,
                    `import config from ${JSON.stringify(resolvedPath.replaceAll('\\', '/'))}
import { createFilesRouter } from 'files-sdk/api'
${nitroMajorVersion(nitro) >= 3 ? '' : "import { createRouteHandler } from 'files-sdk/nitro'"}
import { getFiles } from ${JSON.stringify(internalPath)}

const route = config.routes[${index}]
const environmentSecret = typeof process === 'undefined' ? undefined : process.env?.FILES_API_SECRET
const secret = route.authorize
  ? route.secret || environmentSecret || crypto.randomUUID() + crypto.randomUUID()
  : route.secret
if (route.authorize && !route.secret && !environmentSecret) {
  console.warn('[nuxt-files-sdk:gateway-secret] Set FILES_API_SECRET for upload tokens shared across processes.')
}
let sharedRouter
const makeRouter = (event) => createFilesRouter({
  ...route,
  files: () => getFiles(${route.storage === undefined ? '' : JSON.stringify(route.storage)}),
  secret,
  authorize: route.authorize && ((context) => route.authorize({ ...context, event })),
})
export default (event) => {
  const router = route.authorize ? makeRouter(event) : (sharedRouter ??= makeRouter(event))
  return ${handler}
}
`,
                )
            }),
        )
    }
    await writeRuntime()
}
