import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { resolveModulePath } from 'exsolve'
import { getPackageInfoSync, resolveModule } from 'local-pkg'
import { exports as resolveExports } from 'resolve.exports'

export type PackageManifest = NonNullable<ReturnType<typeof getPackageInfoSync>>['packageJson'] & {
    name: string
    version: string
}

export interface PackageInfo {
    manifest: PackageManifest
    manifestPath: string
    root: string
}

const packageName = (specifier: string): string =>
    specifier
        .split('/')
        .slice(0, specifier.startsWith('@') ? 2 : 1)
        .join('/')

/** Resolve first to keep local-pkg silent when an optional dependency is absent. */
export const packageInfo = (specifier: string, from: URL): PackageInfo | undefined => {
    const name = packageName(specifier)
    const entry = resolveModule(specifier, { paths: [from.href] })
    if (entry) {
        const info = getPackageInfoSync(entry)
        if (info?.packageJson.name === name) {
            const manifestPath = realpathSync(info.packageJsonPath)
            const manifest = { ...info.packageJson, name, version: info.version ?? '' }
            return { manifest, manifestPath, root: dirname(manifestPath) }
        }
    }
    // A package can expose only subpaths. Failed root resolution does not prove absence.
    for (const directory of createRequire(from).resolve.paths(name) ?? []) {
        const path = join(directory, name, 'package.json')
        if (!existsSync(path)) continue
        const manifest: PackageManifest = JSON.parse(readFileSync(path, 'utf8'))
        if (manifest.name !== name) continue
        const manifestPath = realpathSync(path)
        return { manifest, manifestPath, root: dirname(manifestPath) }
    }
    return undefined
}

export const resolvePackage = (
    specifier: string,
    from: URL,
    conditions: string[] = ['node', 'import'],
):
    | { status: 'resolved'; entry: string; package: PackageInfo }
    | { status: 'unresolved'; package: PackageInfo }
    | { status: 'missing' } => {
    const info = packageInfo(specifier, from)
    if (!info) return { status: 'missing' }
    const entry = publicEntry(info, specifier, conditions)
    return entry
        ? { status: 'resolved', entry: entry.replaceAll('\\', '/'), package: info }
        : { status: 'unresolved', package: info }
}

export const resolveOwnedSdk = (from = import.meta.url): PackageInfo => {
    const result = resolvePackage('files-sdk', new URL(from))
    if (result.status !== 'resolved') {
        throw new Error('[nuxt-files-sdk:sdk-resolution] The owned Files SDK dependency could not be resolved.')
    }
    return result.package
}

const publicEntry = (info: PackageInfo, specifier: string, conditions: string[]): string | undefined => {
    // exsolve caches package.json internally even with cache:false. Resolve fresh exports first
    // so installing/replacing a dependency during development cannot retain a stale result.
    try {
        const suffix = specifier.slice(info.manifest.name.length)
        const target = info.manifest.exports
            ? resolveExports(info.manifest as Parameters<typeof resolveExports>[0], `.${suffix}`, {
                  conditions,
                  unsafe: true,
              })?.[0]
            : suffix
              ? `.${suffix}`
              : info.manifest.main || './index.js'
        if (!target) return undefined
        return resolveModulePath(new URL(target, pathToFileURL(info.manifestPath)).href, {
            conditions,
            cache: false,
            try: true,
            extensions: ['.js', '.json', '.node'],
            suffixes: ['', '/index'],
        })
    } catch {
        return undefined
    }
}

export const sdkEntry = (sdk: PackageInfo, subpath: string, conditions = ['node', 'import']): string => {
    const entry = publicEntry(sdk, subpath, conditions)
    if (!entry) throw new Error(`[nuxt-files-sdk:sdk-exports] Cannot resolve public entry ${subpath}.`)
    return entry.replaceAll('\\', '/')
}

/** Enumerate public subpaths without evaluating providers. Root comes last for prefix alias engines. */
export const sdkAliases = (sdk: PackageInfo, conditions = ['node', 'import']): Record<string, string> =>
    Object.fromEntries(
        Object.keys(sdk.manifest.exports ?? {})
            .toSorted((a, b) => b.length - a.length)
            .map((key) => {
                if (key !== '.' && (!key.startsWith('./') || key.includes('*'))) {
                    throw new Error(`[nuxt-files-sdk:sdk-exports] Unsupported public export pattern: ${key}`)
                }
                const suffix = key === '.' ? '' : key.slice(1)
                return [`#files-sdk${suffix}`, sdkEntry(sdk, `files-sdk${suffix}`, conditions)]
            }),
    )

export const registerSdkAliases = (
    aliases: Record<string, string>,
    sdk: PackageInfo,
    conditions = ['node', 'import'],
): Record<string, string> => {
    const selected = sdkAliases(sdk, conditions)
    let node: Record<string, string> | undefined
    let browser: Record<string, string> | undefined
    for (const [name, path] of Object.entries(aliases)) {
        if (name !== '#files-sdk' && !name.startsWith('#files-sdk/')) continue
        const normalized = path.replaceAll('\\', '/')
        if (selected[name] === normalized) continue
        node ??= sdkAliases(sdk)
        browser ??= sdkAliases(sdk, ['browser', 'import'])
        if (![node[name], browser[name]].includes(normalized)) {
            throw new Error(`[nuxt-files-sdk:reserved-alias] ${name} must refer to the owned Files SDK.`)
        }
    }
    return { ...selected, ...Object.fromEntries(Object.entries(aliases).filter(([name]) => !(name in selected))) }
}

export const sdkTypePaths = (sdk: PackageInfo): Record<string, string[]> =>
    Object.fromEntries(Object.entries(sdkAliases(sdk, ['types', 'import'])).map(([name, entry]) => [name, [entry]]))
