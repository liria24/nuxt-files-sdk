import { readFile } from 'node:fs/promises'

import type { ProviderSlug } from 'files-sdk'
import { getProvider, listEnvVars } from 'files-sdk/providers'

import { normalizeFilesConfig } from '../runtime/normalize'
import type { FilesConfigLoaderOptions } from './load'

export const selectedAdapters = (
    config: unknown,
    entries = normalizeFilesConfig(config),
): { adapters: ProviderSlug[]; single: boolean } => {
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

export const gatewayRoutes = (
    config: unknown,
    storages = normalizeFilesConfig(config),
): { path: string; storage?: string }[] => {
    const routes = config && typeof config === 'object' && 'routes' in config ? config.routes : undefined
    if (routes === undefined) return []
    if (!Array.isArray(routes)) throw new Error('[nuxt-files-sdk:invalid-route] routes must be an array.')
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
        if ('authorize' in route && route.authorize !== undefined && typeof route.authorize !== 'function') {
            throw new Error('[nuxt-files-sdk:invalid-route] authorize must be a function.')
        }
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
                `import { ${factoryName(adapter)} as provider${index} } from ${JSON.stringify(`#files-sdk/${adapter}`)}`,
        )
        .join('\n'),
    factories: adapters.map((adapter, index) => `${JSON.stringify(adapter)}: provider${index}`).join(', '),
})

export const prepareFilesConfig = async (options: FilesConfigLoaderOptions) => {
    const { loadFilesConfig } = await import('./load')
    const { pruneFilesConfigSource } = await import('./prune')
    const original = await readFile(options.configPath, 'utf8')
    const source = options.injectImports ? (await options.injectImports(original, options.configPath)).code : original
    const config = await loadFilesConfig({ ...options, source, injectImports: undefined })
    if (!config) return undefined
    const entries = normalizeFilesConfig(config)
    const { adapters, single } = selectedAdapters(config, entries)
    return {
        config,
        entries,
        adapters,
        single,
        routes: gatewayRoutes(config, entries),
        providers: providerCode(adapters),
        source: pruneFilesConfigSource(source, options.configPath, options.environments),
        environment: Object.fromEntries(
            adapters.map((adapter) => [
                adapter,
                listEnvVars(adapter)
                    .filter((variable) => variable.readBy === 'files-sdk')
                    .map((variable) => [variable.key, ...(variable.aliases ?? [])]),
            ]),
        ),
    }
}
