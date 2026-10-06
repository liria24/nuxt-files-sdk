import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { addServerHandler, addTemplate, addTypeTemplate, resolveServerVariant, useLogger, useTerminal } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { parseSync } from 'oxc-parser'

import { prepareFilesConfig } from '../config/prepare'
import { fileHash } from '../runtime/development'
import { filesBuilderCapabilities, requireFilesGateway } from './capabilities'
import { deploymentTarget, storageDependencies } from './dependencies'
import { dependencySession, diagnoseDependencies } from './diagnostics'
import { configSources, subpathDependencies } from './imports'
import { optionalAwsSdkDependencies, storageTypes, wireNuxtNitroAwsOptions, wireNuxtNitroOptions } from './nitro'
import { stopNitroDevReloadOnClose } from './nitro-dev-close'
import { reportNuxtDependencyIssues } from './nuxt-diagnostics'
import { registerSdkAliases, resolveOwnedSdk, resolvePackage, sdkTypePaths } from './resolve'
import { withFilesTask } from './terminal'
import { watchFiles } from './update'

const normalized = (path: string): string => path.replaceAll('\\', '/')
const runtimeFile = (path: string): string => normalized(fileURLToPath(new URL(path, import.meta.url)))

/** Supply the module's configuration helper without evaluating any runtime resolver. */
const injectConfigImports = async (source: string, filename?: string): Promise<{ code: string }> => {
    const body = parseSync(filename ?? 'files.config.ts', source, { lang: 'ts' }).program.body
    const declared = body.some((node) =>
        node.type === 'ImportDeclaration'
            ? node.specifiers.some((specifier) => specifier.local.name === 'defineFilesConfig')
            : node.type === 'FunctionDeclaration'
              ? node.id?.name === 'defineFilesConfig'
              : node.type === 'VariableDeclaration' &&
                node.declarations.some(
                    (declaration) =>
                        declaration.id.type === 'Identifier' && declaration.id.name === 'defineFilesConfig',
                ),
    )
    return {
        code: declared
            ? source
            : `import { defineFilesConfig } from ${JSON.stringify(runtimeFile('../config.js'))}\n${source}`,
    }
}

export interface NuxtFilesIntegrationOptions {
    configPath: string
}

/** Generate one runtime import graph; Nuxt never initializes Files through a Nitro startup plugin. */
export const setupNuxtFilesIntegration = async (nuxt: Nuxt, options: NuxtFilesIntegrationOptions): Promise<boolean> => {
    const logger = useLogger('nuxt-files-sdk')
    const terminal = useTerminal()
    const configPath = normalized(options.configPath)
    const sdk = resolveOwnedSdk()
    nuxt.options.alias = registerSdkAliases(nuxt.options.alias, sdk, ['browser', 'import'])
    // Nitro gives its server-only aliases precedence over general Nuxt aliases.
    const preparationAliases = () => {
        const native = nuxt.options.nitro
        const aliases = 'alias' in native && native.alias && typeof native.alias === 'object' ? native.alias : {}
        return registerSdkAliases(
            {
                ...nuxt.options.alias,
                ...Object.fromEntries(
                    Object.entries(aliases).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
                ),
            },
            sdk,
            ['node', 'import'],
        )
    }
    const graph = configSources(configPath, preparationAliases())
    const inputHashes = Object.fromEntries(graph.files.map((path) => [path, fileHash(path)]))
    const environments = nuxt.options.nitro.static
        ? ['production', 'prerender']
        : [nuxt.options.envName || (nuxt.options.dev ? 'development' : 'production')]
    const prepare = () =>
        prepareFilesConfig({
            configPath,
            environments,
            alias: preparationAliases(),
            injectImports: injectConfigImports,
        })
    let prepared
    try {
        prepared = await withFilesTask(terminal, 'Preparing Files configuration', prepare)
    } catch (error) {
        try {
            await reportNuxtDependencyIssues(
                diagnoseDependencies(
                    sdk,
                    graph.sdkImports.flatMap((subpath) => subpathDependencies(sdk, subpath)),
                    preparationAliases(),
                ),
                dependencySession(nuxt.options.rootDir),
                logger,
                nuxt.options.rootDir,
            )
        } catch {
            /* Supplementary advice must not replace the original configuration error. */
        }
        throw error
    }
    if (Object.entries(inputHashes).some(([path, hash]) => fileHash(path) !== hash)) {
        throw new Error(
            '[nuxt-files-sdk:config-changed] Files configuration changed during preparation. Retry preparation.',
        )
    }

    let watcher: ReturnType<typeof watchFiles> | undefined
    if (nuxt.options.dev) {
        const roots = new Set([nuxt.options.rootDir, nuxt.options.workspaceDir, ...graph.files.map(dirname)])
        watcher = watchFiles(
            [
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
            ],
            async () => {
                watcher?.add(configSources(configPath, preparationAliases()).files)
                await withFilesTask(terminal, 'Updating Files configuration', prepare)
                await nuxt.callHook('restart')
            },
            (error) => logger.warn(error instanceof Error ? error.message : String(error)),
        )
        nuxt.hook('close', () => watcher?.close())
    }
    if (!prepared) return false

    const major = resolveServerVariant({ nitro2: 2, nitro3: 3, nuxt: 0 }) ?? 0
    // This observes native development shutdown; Registry initialization stays in generated runtime imports.
    if (nuxt.options.dev && major === 2) nuxt.hook('nitro:init', stopNitroDevReloadOnClose)
    let awsShims: string[] = []
    if (
        major === 2 &&
        optionalAwsSdkDependencies(prepared.adapters, {
            nitroMajor: major,
            preset: 'cloudflare-module',
            resolvable: () => false,
        }).length
    ) {
        nuxt.hook('nitro:init', (nitro) => {
            awsShims = wireNuxtNitroAwsOptions(nitro, { sdk, adapters: prepared.adapters, nitroMajor: major })
        })
    }
    const capabilities = filesBuilderCapabilities(major === 2 ? 'nitro2' : major === 3 ? 'nitro3' : 'nuxt')
    requireFilesGateway(prepared.routes.length > 0, capabilities.gateway)
    const mode = nuxt.options.dev ? '.dev' : ''
    const template = (name: string, contents: string): string =>
        normalized(
            addTemplate({
                filename: `nuxt-files-sdk/${name}${mode}.mjs`,
                write: true,
                getContents: () => contents,
            }).dst,
        )
    const selected = normalized(
        addTemplate({
            filename: `nuxt-files-sdk/selected${mode}.ts`,
            write: true,
            getContents: () => prepared.source,
        }).dst,
    )
    const branches = environments
        .flatMap((name) => [`raw[${JSON.stringify(`$${name}`)}]`, `raw.$env?.[${JSON.stringify(name)}]`])
        .toReversed()
    const resolved = template(
        'resolved',
        `import raw from ${JSON.stringify(selected)}\nimport { mergeFilesConfig } from ${JSON.stringify(runtimeFile('../config/merge.js'))}\nconst resolved = mergeFilesConfig(${[...branches, 'raw'].join(', ')})\nexport default { storage: resolved.storage, routes: resolved.routes }\n`,
    )

    const adapterDependencies = new Map(
        prepared.adapters.map((adapter) => [adapter, subpathDependencies(sdk, `files-sdk/${adapter}`)]),
    )
    const requirementsFor = (preset?: string) =>
        [...prepared.entries.values()].flatMap((entry) =>
            storageDependencies(
                entry,
                deploymentTarget(preset),
                typeof entry.storage.adapter === 'string' ? adapterDependencies.get(entry.storage.adapter)! : [],
            ),
        )
    const requirements = requirementsFor(
        'preset' in nuxt.options.nitro && typeof nuxt.options.nitro.preset === 'string'
            ? nuxt.options.nitro.preset
            : undefined,
    )
    for (const subpath of graph.sdkImports) requirements.push(...subpathDependencies(sdk, subpath))
    const diagnostics = diagnoseDependencies(sdk, requirements, preparationAliases())
    const previous = dependencySession(nuxt.options.rootDir)
    // Native Nitro resolves environment presets and server aliases after module setup.
    // Report its requirements only after that resolution and compatibility alias registration.
    if (!major) await reportNuxtDependencyIssues(diagnostics, previous, logger, nuxt.options.rootDir)
    if (major && requirements.length) {
        nuxt.hook('nitro:init', async (value) => {
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            const native = value as { options: { preset: string; alias: Record<string, string> } }
            const resolvedRequirements = requirementsFor(native.options.preset)
            for (const subpath of graph.sdkImports) resolvedRequirements.push(...subpathDependencies(sdk, subpath))
            await reportNuxtDependencyIssues(
                diagnoseDependencies(sdk, resolvedRequirements, native.options.alias, awsShims),
                previous,
                logger,
                nuxt.options.rootDir,
            )
        })
    }
    watcher?.add(
        requirements.flatMap(({ dependency, conditions }) => {
            const result = resolvePackage(dependency, pathToFileURL(sdk.manifestPath), conditions)
            return result.status === 'missing' ? [] : [result.package.manifestPath]
        }),
    )

    const hooksImport =
        major === 2
            ? "import { useNitroApp } from 'nitropack/runtime'"
            : major === 3
              ? "import { useNitroHooks } from 'nitro/app'"
              : ''
    const callHook = major === 2 ? 'useNitroApp().hooks.callHook' : 'useNitroHooks().callHook'
    const registry = template(
        'registry',
        `import config from ${JSON.stringify(resolved)}\n${prepared.providers.imports}\nimport { configureFiles } from ${JSON.stringify(runtimeFile('../runtime/internal.js'))}\n${hooksImport}\n\nexport const registry = configureFiles(config, {\n  factories: { ${prepared.providers.factories} },\n  environment: ${JSON.stringify(prepared.environment)},\n  ${nuxt.options.dev ? `dependencies: ${JSON.stringify(diagnostics)},` : ''}\n  ${major ? `hooks: {\n    onAction: (event, storage) => ${callHook}('files:action', { event, storage }),\n    onError: (event, storage) => ${callHook}('files:error', { event, storage }),\n    onRetry: (event, storage) => ${callHook}('files:retry', { event, storage }),\n  },` : ''}\n})\n`,
    )
    const runtime = template(
        'runtime',
        `import { registry } from '#nuxt-files-sdk/registry'
import { sync, transfer } from '#files-sdk'
export const useServerFiles = name => name === undefined ? registry.get() : registry.get(name)
const files = value => typeof value === 'string' ? registry.get(value) : value
export const syncFiles = (source, destination, options) => sync(files(source), files(destination), options)
export const transferFiles = (source, destination, options) => transfer(files(source), files(destination), options)
`,
    )
    addTypeTemplate(
        {
            filename: `nuxt-files-sdk/runtime${mode}.d.ts`,
            getContents: () => `export * from ${JSON.stringify(runtimeFile('../runtime.js'))}\n`,
        },
        { nuxt: false },
    )
    nuxt.options.alias['nuxt-files-sdk/runtime'] = runtime
    nuxt.options.alias['#nuxt-files-sdk/registry'] = registry
    nuxt.hook('nitro:config', (config) =>
        wireNuxtNitroOptions(config, {
            sdk,
            runtime,
            registry,
            resolved,
            selected,
            selectedSource: prepared.source,
            configPath,
            development: nuxt.options.dev,
        }),
    )

    const declarations = addTypeTemplate(
        {
            filename: 'nuxt-files-sdk/storage-registry.d.ts',
            getContents: () =>
                storageTypes(configPath, major) +
                `
declare global {
  /** Return the project's Files client, including its configured plugin extensions. */
  const useServerFiles: typeof import('nuxt-files-sdk/runtime').useServerFiles
  /** Delegate a mirror operation to the native Files SDK. */
  const syncFiles: typeof import('nuxt-files-sdk/runtime').syncFiles
  /** Delegate a transfer operation to the native Files SDK. */
  const transferFiles: typeof import('nuxt-files-sdk/runtime').transferFiles
}
`,
        },
        { nuxt: true, nitro: true, shared: true },
    )
    nuxt.hook(
        'prepare:types',
        ({
            references,
            nodeReferences,
            sharedReferences,
            serverReferences,
            tsConfig,
            nodeTsConfig,
            sharedTsConfig,
            serverTsConfig,
        }) => {
            for (const values of [references, nodeReferences, sharedReferences, serverReferences]) {
                if (!values.some((entry) => 'path' in entry && entry.path === declarations.dst))
                    values.push({ path: declarations.dst })
            }
            for (const config of [tsConfig, nodeTsConfig, sharedTsConfig, serverTsConfig]) {
                ;(config.include ??= []).push(configPath)
                Object.assign(((config.compilerOptions ??= {}).paths ??= {}), sdkTypePaths(sdk), {
                    'nuxt-files-sdk/runtime': [runtimeFile('../runtime.d.ts')],
                })
            }
        },
    )

    for (const [index, route] of prepared.routes.entries()) {
        const handler = template(
            `gateway-${index}`,
            `import { defineEventHandler, deriveSecret } from 'nuxt/server'
import config from ${JSON.stringify(resolved)}
import { createFilesRouter } from '#files-sdk/api'
import { useServerFiles } from 'nuxt-files-sdk/runtime'
import { resolveGatewaySecret } from ${JSON.stringify(runtimeFile('../runtime/gateway-secret.js'))}
${nuxt.options.dev ? `import { developmentConfigCurrent } from ${JSON.stringify(runtimeFile('../runtime/development.js'))}\nconst inputHashes = ${JSON.stringify(inputHashes)}` : ''}
const route = config.routes[${index}]
let secretPromise
const gatewaySecret = () => secretPromise ??= resolveGatewaySecret(
  route.secret,
  typeof process === 'undefined' ? undefined : process.env?.FILES_API_SECRET,
  () => deriveSecret(${JSON.stringify(`nuxt-files-sdk:gateway:${route.path}`)}),
).catch(error => {
  secretPromise = undefined
  throw error
})
let sharedRouter
const makeRouter = (event, secret) => createFilesRouter({
  ...route,
  files: () => useServerFiles(${route.storage === undefined ? '' : JSON.stringify(route.storage)}),
  secret,
  authorize: route.authorize && ((context) => route.authorize({ ...context, event })),
})
export default defineEventHandler(async event => {
  ${nuxt.options.dev ? "if (!developmentConfigCurrent(inputHashes)) return new Response('Files configuration is being updated.', { status: 503 })" : ''}
  const secret = await gatewaySecret()
  const router = route.authorize
    ? makeRouter(event, secret)
    : (sharedRouter ??= makeRouter(event, secret))
  return router.handle(event.req)
})
`,
        )
        addServerHandler({ route: route.path, handler: { nuxt: handler } })
    }
    return true
}
