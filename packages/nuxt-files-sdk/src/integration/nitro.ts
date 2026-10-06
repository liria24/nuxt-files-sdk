import { mkdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { ProviderSlug } from 'files-sdk'
import { getProvider } from 'files-sdk/providers'

import { prepareFilesConfig } from '../config/prepare'
import { fileHash } from '../runtime/development'
import { deploymentTarget, storageDependencies } from './dependencies'
import { dependencySession, diagnoseDependencies, reportDependencyIssues } from './diagnostics'
import { configSources, subpathDependencies } from './imports'
import { registerSdkAliases, resolveOwnedSdk, resolvePackage, sdkTypePaths } from './resolve'
import { watchFiles, writeChanged as writeFile } from './update'

export interface NitroIntegration {
    logger?: { warn(message: string): void }
    meta?: { majorVersion?: number }
    options: {
        rootDir: string
        workspaceDir?: string
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
        callHook?(name: 'restart'): Promise<void>
        hook(name: 'close', callback: () => void): void
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
    restart?: () => void | Promise<void>
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

const hookTypes = (moduleName: 'nitropack/types' | 'nitro/types'): string => `
declare module ${JSON.stringify(moduleName)} {
  interface NitroRuntimeHooks {
    'files:action': (payload: { event: import('#files-sdk').FilesActionEvent; storage?: string }) => void | Promise<void>
    'files:error': (payload: { event: import('#files-sdk').FilesErrorEvent; storage?: string }) => void | Promise<void>
    'files:retry': (payload: { event: import('#files-sdk').FilesRetryEvent; storage?: string }) => void | Promise<void>
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
${nitroMajor === 0 ? '' : hookTypes(nitroMajor >= 3 ? 'nitro/types' : 'nitropack/types')}
export {}
`

export const setupNitroFilesIntegration = async (
    nitro: NitroIntegration,
    options: NitroFilesIntegrationOptions,
): Promise<boolean> => {
    const sdk = resolveOwnedSdk()
    for (const dependency of [...AWS_CORE_DEPENDENCIES, AWS_MULTIPART_DEPENDENCY]) {
        const shim = resolve(
            nitro.options.rootDir,
            nitro.options.buildDir,
            'nuxt-files-sdk',
            `${dependency.replaceAll(/[^a-z0-9]+/giu, '-')}.mjs`,
        ).replaceAll('\\', '/')
        if (nitro.options.alias?.[dependency]?.replaceAll('\\', '/') === shim) delete nitro.options.alias[dependency]
    }
    nitro.options.alias = registerSdkAliases(nitro.options.alias ?? {}, sdk)
    const configPath = options.configPath.replaceAll('\\', '/')
    const graph = configSources(configPath, nitro.options.alias)
    const inputHashes = Object.fromEntries(graph.files.map((path) => [path, fileHash(path)]))
    let prepared
    try {
        prepared = await prepareFilesConfig({
            configPath,
            environments: options.environments,
            alias: nitro.options.alias,
            injectImports: nitro.unimport?.injectImports.bind(nitro.unimport),
        })
    } catch (error) {
        // Supplement a real import failure while preserving the original native exception.
        try {
            const requirements = graph.sdkImports.flatMap((subpath) => subpathDependencies(sdk, subpath))
            reportDependencyIssues(
                diagnoseDependencies(sdk, requirements, nitro.options.alias),
                dependencySession(nitro.options.rootDir),
                (message) => nitro.logger?.warn(message),
            )
        } catch {
            /* Supplementary inspection must never replace the configuration error. */
        }
        throw error
    }
    if (Object.entries(inputHashes).some(([path, hash]) => fileHash(path) !== hash)) {
        throw new Error(
            '[nuxt-files-sdk:config-changed] Files configuration changed during preparation. Retry preparation.',
        )
    }
    let watcher: ReturnType<typeof watchFiles> | undefined
    if (nitro.options.dev) {
        const roots = new Set([
            nitro.options.rootDir,
            nitro.options.workspaceDir ?? nitro.options.rootDir,
            ...graph.files.map((path) => resolve(path, '..')),
        ])
        const watched = [
            ...graph.files,
            sdk.manifestPath,
            ...[...roots].flatMap((root) =>
                [
                    'package.json',
                    'bun.lock',
                    'package-lock.json',
                    'pnpm-lock.yaml',
                    'yarn.lock',
                    'node_modules/.package-lock.json',
                ].map((name) => resolve(root, name)),
            ),
        ]
        watcher = watchFiles(
            watched,
            async () => {
                watcher?.add(configSources(configPath, nitro.options.alias).files)
                // Keep the current watcher alive while invalid config is being repaired.
                await prepareFilesConfig({
                    configPath,
                    environments: options.environments,
                    alias: nitro.options.alias,
                    injectImports: nitro.unimport?.injectImports.bind(nitro.unimport),
                })
                await (options.restart ? options.restart() : nitro.hooks.callHook?.('restart'))
            },
            (error) => nitro.logger?.warn(error instanceof Error ? error.message : String(error)),
        )
        nitro.hooks.hook('close', () => watcher?.close())
    }
    if (!prepared) return false
    const directory = resolve(nitro.options.rootDir, nitro.options.buildDir, 'nuxt-files-sdk')
    const typesPath = resolve(directory, 'storage-registry.d.ts')
    let writeRuntime: (() => Promise<void>) | undefined
    const writeTypes = async (): Promise<void> => {
        await mkdir(directory, { recursive: true })
        await writeFile(typesPath, storageTypes(configPath, nitroMajorVersion(nitro)))
        await writeFile(
            resolve(directory, 'tsconfig.json'),
            JSON.stringify(
                {
                    compilerOptions: { paths: sdkTypePaths(sdk) },
                    include: [typesPath.replaceAll('\\', '/')],
                },
                null,
                2,
            ),
        )
    }
    await writeTypes()
    nitro.hooks.hook('types:extend', async (types) => {
        await writeTypes()
        await writeRuntime?.()
        const tsConfig = (types.tsConfig ??= {})
        ;(tsConfig.include ??= []).push(typesPath)
        const paths = ((tsConfig.compilerOptions ??= {}).paths ??= {})
        Object.assign(paths, sdkTypePaths(sdk))
    })
    const { routes, adapters, providers, environment } = prepared
    const internalPath = fileURLToPath(new URL('../runtime/internal.js', import.meta.url)).replaceAll('\\', '/')
    const aliases = nitro.options.alias ?? {}
    const awsShims = optionalAwsSdkDependencies(adapters, {
        nitroMajor: nitroMajorVersion(nitro),
        preset: nitro.options.preset,
        resolvable: (dependency) => {
            if (Object.hasOwn(aliases, dependency)) return true
            return resolvePackage(dependency, pathToFileURL(sdk.manifestPath)).status === 'resolved'
        },
    })
    const adapterDependencies = new Map(
        prepared.adapters.map((adapter) => [adapter, subpathDependencies(sdk, `files-sdk/${adapter}`)]),
    )
    const requirements = [...prepared.entries.values()].flatMap((entry) =>
        storageDependencies(
            entry,
            deploymentTarget(nitro.options.preset),
            typeof entry.storage.adapter === 'string' ? adapterDependencies.get(entry.storage.adapter)! : [],
        ),
    )
    for (const subpath of graph.sdkImports) requirements.push(...subpathDependencies(sdk, subpath))
    const dependencyDiagnostics = diagnoseDependencies(sdk, requirements, aliases, awsShims)
    watcher?.add(
        requirements.flatMap(({ dependency, conditions }) => {
            const result = resolvePackage(dependency, pathToFileURL(sdk.manifestPath), conditions)
            return result.status === 'missing' ? [] : [result.package.manifestPath]
        }),
    )
    reportDependencyIssues(dependencyDiagnostics, dependencySession(nitro.options.rootDir), (message) =>
        nitro.logger?.warn(message),
    )
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
                /^([ \t]*)const (defineFilesConfig|useServerFiles|syncFiles|transferFiles): typeof .*\.\2$/gmu,
                (_, indent: string, name: string) =>
                    `${name === 'useServerFiles' ? `${indent}/** Return the project's Files client, including its configured plugin extensions. */\n` : ''}${indent}const ${name}: typeof import('nuxt-files-sdk/${name === 'defineFilesConfig' ? 'config' : 'runtime'}').${name}`,
            ),
    })
    // Bundle the integration and selected native SDK entries, including installed consumers.
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
        await writeFile(selectedPath, prepared.source)
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
  ${nitro.options.dev ? `dependencies: ${JSON.stringify(dependencyDiagnostics)},` : ''}
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
                const request = nitroMajorVersion(nitro) >= 3 ? 'event.req' : 'toWebRequest(event)'
                return writeFile(
                    path,
                    `import config from ${JSON.stringify(resolvedPath.replaceAll('\\', '/'))}
import { createFilesRouter } from '#files-sdk/api'
${nitroMajorVersion(nitro) >= 3 ? '' : "import { toWebRequest } from 'h3'"}
import { nitroRequestEvent, nitroResponse } from ${JSON.stringify(fileURLToPath(new URL('./nitro-event.js', import.meta.url)).replaceAll('\\', '/'))}
import { getFiles } from ${JSON.stringify(internalPath)}
import { resolveGatewaySecret } from ${JSON.stringify(fileURLToPath(new URL('../runtime/gateway-secret.js', import.meta.url)).replaceAll('\\', '/'))}
${nitro.options.dev ? `import { developmentConfigCurrent } from ${JSON.stringify(fileURLToPath(new URL('../runtime/development.js', import.meta.url)).replaceAll('\\', '/'))}\nconst inputHashes = ${JSON.stringify(inputHashes)}` : ''}

const route = config.routes[${index}]
const environmentSecret = typeof process === 'undefined' ? undefined : process.env?.FILES_API_SECRET
const secret = await resolveGatewaySecret(route.secret, environmentSecret)
let sharedRouter
const makeRouter = (event) => createFilesRouter({
  ...route,
  files: () => getFiles(${route.storage === undefined ? '' : JSON.stringify(route.storage)}),
  secret,
  authorize: route.authorize && ((context) => route.authorize({ ...context, event })),
})
export default async (event) => {
  ${nitro.options.dev ? `if (!developmentConfigCurrent(inputHashes)) return new Response('Files configuration is being updated.', { status: 503 })` : ''}
  const portable = nitroRequestEvent(${request}, event.context)
  const router = route.authorize ? makeRouter(portable) : (sharedRouter ??= makeRouter(portable))
  return nitroResponse(await router.handle(portable.req), portable)
}
`,
                )
            }),
        )
    }
    await writeRuntime()
    return true
}

/** Preserve TypeScript compilation when Nuxt places its build directory inside node_modules. */
export const selectedSourcePlugin = (options: { selected: string; source: string; configPath: string }) => {
    const selected = options.selected.replaceAll('\\', '/')
    const id = `nuxt-files-sdk:${basename(selected)}`
    return {
        name: 'nuxt-files-sdk-selected-source',
        resolveId(
            this: {
                resolve(source: string, importer: string, options: { skipSelf: true }): Promise<{ id: string } | null>
            },
            source: string,
            importer?: string,
        ) {
            if (source.replaceAll('\\', '/') === selected) return id
            if (importer === id) return this.resolve(source, options.configPath, { skipSelf: true })
            return null
        },
        load(source: string) {
            return source === id ? options.source : null
        },
    }
}

/** Preserve Nuxt's runtime inline rules when Nitro 2 receives native Windows resolver paths. */
export const inlineNuxtRuntime = (id: string): boolean =>
    id.includes('\\') &&
    /^(?:nuxt|nuxt3|nuxt-nightly)\/dist\//u.test(id.replaceAll('\\', '/').split('node_modules/').at(-1)!)

/** Native bundle settings stay in the Nitro adapter, including Nuxt's Nitro-backed path. */
export const wireNuxtNitroOptions = (
    value: unknown,
    options: {
        sdk: ReturnType<typeof resolveOwnedSdk>
        runtime: string
        registry: string
        resolved: string
        selected: string
        selectedSource: string
        configPath: string
        development: boolean
    },
): void => {
    // The public schema deliberately does not embed Nitro's native option types.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const config = value as Pick<NitroIntegration['options'], 'alias' | 'externals'> & {
        rollupConfig?: { plugins?: unknown[] }
    }
    config.alias = registerSdkAliases(
        { ...config.alias, 'nuxt-files-sdk/runtime': options.runtime, '#nuxt-files-sdk/registry': options.registry },
        options.sdk,
    )
    const inline = ((config.externals ??= {}).inline ??= [])
    inline.push('nuxt-files-sdk', options.runtime, options.registry, options.resolved, options.selected)
    // Nitro 2 normalizes the original ID, but checks resolved Windows IDs without normalization.
    // A public inline callback preserves only the runtime prefixes Nuxt already inlines.
    inline.push(inlineNuxtRuntime)
    if (!options.development) inline.push('files-sdk')
    const plugins = ((config.rollupConfig ??= {}).plugins ??= [])
    plugins.push(
        selectedSourcePlugin({
            selected: options.selected,
            source: options.selectedSource,
            configPath: options.configPath,
        }),
    )
}
