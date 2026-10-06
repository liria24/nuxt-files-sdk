import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { addServerHandler, addTemplate, addTypeTemplate, logger, resolveServerVariant } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { parseSync } from 'oxc-parser'

import { prepareFilesConfig } from '../config/prepare'
import { fileHash } from '../runtime/development'
import { filesBuilderCapabilities, requireFilesGateway } from './capabilities'
import { deploymentTarget, storageDependencies } from './dependencies'
import { dependencySession, diagnoseDependencies, reportDependencyIssues } from './diagnostics'
import { configSources, subpathDependencies } from './imports'
import { storageTypes, wireNuxtNitroOptions } from './nitro'
import { registerSdkAliases, resolveOwnedSdk, resolvePackage, sdkTypePaths } from './resolve'
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
    const configPath = normalized(options.configPath)
    const sdk = resolveOwnedSdk()
    nuxt.options.alias = registerSdkAliases(nuxt.options.alias, sdk, ['browser', 'import'])
    const graph = configSources(configPath, nuxt.options.alias)
    const inputHashes = Object.fromEntries(graph.files.map((path) => [path, fileHash(path)]))
    const environments = nuxt.options.nitro.static
        ? ['production', 'prerender']
        : [nuxt.options.envName || (nuxt.options.dev ? 'development' : 'production')]
    const prepare = () =>
        prepareFilesConfig({
            configPath,
            environments,
            alias: nuxt.options.alias,
            injectImports: injectConfigImports,
        })
    const prepared = await prepare()
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
                watcher?.add(configSources(configPath, nuxt.options.alias).files)
                await prepare()
                await nuxt.callHook('restart')
            },
            (error) => logger.warn(error instanceof Error ? error.message : String(error)),
        )
        nuxt.hook('close', () => watcher?.close())
    }
    if (!prepared) return false

    const major = resolveServerVariant({ nitro2: 2, nitro3: 3, nuxt: 0 }) ?? 0
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
    const requirements = [...prepared.entries.values()].flatMap((entry) =>
        storageDependencies(
            entry,
            deploymentTarget(
                'preset' in nuxt.options.nitro && typeof nuxt.options.nitro.preset === 'string'
                    ? nuxt.options.nitro.preset
                    : undefined,
            ),
            typeof entry.storage.adapter === 'string' ? adapterDependencies.get(entry.storage.adapter)! : [],
        ),
    )
    for (const subpath of graph.sdkImports) requirements.push(...subpathDependencies(sdk, subpath))
    const diagnostics = diagnoseDependencies(sdk, requirements, nuxt.options.alias)
    reportDependencyIssues(diagnostics, dependencySession(nuxt.options.rootDir), (message) => logger.warn(message))
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
        `import { registry } from '#nuxt-files-sdk/registry'\nvoid registry\nexport * from ${JSON.stringify(runtimeFile('../runtime.js'))}\n`,
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
            development: nuxt.options.dev,
        }),
    )

    const declarations = addTypeTemplate(
        {
            filename: 'nuxt-files-sdk/storage-registry.d.ts',
            getContents: () => storageTypes(configPath, major),
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
            `import { defineEventHandler } from 'nuxt/server'\nimport config from ${JSON.stringify(resolved)}\nimport { createFilesRouter } from '#files-sdk/api'\nimport { useServerFiles } from 'nuxt-files-sdk/runtime'\n${nuxt.options.dev ? `import { developmentConfigCurrent } from ${JSON.stringify(runtimeFile('../runtime/development.js'))}\nconst inputHashes = ${JSON.stringify(inputHashes)}` : ''}\nconst route = config.routes[${index}]\nconst environmentSecret = typeof process === 'undefined' ? undefined : process.env?.FILES_API_SECRET\nconst secret = route.secret || environmentSecret\nlet sharedRouter\nconst makeRouter = (event) => createFilesRouter({\n  ...route,\n  files: () => useServerFiles(${route.storage === undefined ? '' : JSON.stringify(route.storage)}),\n  secret,\n  authorize: route.authorize && ((context) => route.authorize({ ...context, event })),\n})\nexport default defineEventHandler(event => {\n  ${nuxt.options.dev ? "if (!developmentConfigCurrent(inputHashes)) return new Response('Files configuration is being updated.', { status: 503 })" : ''}\n  const router = route.authorize ? makeRouter(event) : (sharedRouter ??= makeRouter(event))\n  return router.handle(event.req)\n})\n`,
        )
        addServerHandler({ route: route.path, handler: { nuxt: handler } })
    }
    return true
}
