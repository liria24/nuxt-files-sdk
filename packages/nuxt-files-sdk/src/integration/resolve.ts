import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { resolveModulePath } from 'exsolve'
import { resolveModule } from 'local-pkg'

export interface PackageManifest {
    name: string
    version: string
    exports?: Record<string, unknown>
    dependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    peerDependenciesMeta?: Record<string, { optional?: boolean }>
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

/** Discover metadata without local-pkg's getPackageInfo/isPackageExists error logging. */
export const packageInfo = (specifier: string, from: URL): PackageInfo | undefined => {
    const name = packageName(specifier)
    const entry = resolveModule(specifier, { paths: [from.href] })
    const candidates: string[] = []
    if (entry) {
        for (let directory = dirname(entry); dirname(directory) !== directory; directory = dirname(directory)) {
            candidates.push(join(directory, 'package.json'))
        }
    }
    // A package can expose only subpaths. Failed root resolution does not prove absence.
    for (const directory of createRequire(from).resolve.paths(name) ?? []) {
        candidates.push(join(directory, name, 'package.json'))
    }
    for (const path of candidates) {
        if (!existsSync(path)) continue
        const manifest = JSON.parse(readFileSync(path, 'utf8')) as PackageManifest
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
): { status: 'resolved' | 'missing' | 'unresolved'; entry?: string; package?: PackageInfo } => {
    const info = packageInfo(specifier, from)
    if (!info) return { status: 'missing' }
    const entry = resolveModulePath(specifier, { from, conditions, cache: false, try: true })
    return entry
        ? { status: 'resolved', entry: entry.replaceAll('\\', '/'), package: info }
        : { status: 'unresolved', package: info }
}

export const resolveOwnedSdk = (from = import.meta.url): PackageInfo => {
    const result = resolvePackage('files-sdk', new URL(from))
    if (result.status !== 'resolved' || !result.package) {
        throw new Error('[nuxt-files-sdk:sdk-resolution] The owned Files SDK dependency could not be resolved.')
    }
    return result.package
}

export const sdkEntry = (sdk: PackageInfo, subpath: string, conditions = ['node', 'import']): string =>
    resolveModulePath(subpath, { from: pathToFileURL(sdk.manifestPath), conditions, cache: false }).replaceAll(
        '\\',
        '/',
    )

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
    const node = sdkAliases(sdk)
    const browser = sdkAliases(sdk, ['browser', 'import'])
    for (const [name, path] of Object.entries(aliases)) {
        if (name !== '#files-sdk' && !name.startsWith('#files-sdk/')) continue
        if (![selected[name], node[name], browser[name]].includes(path.replaceAll('\\', '/'))) {
            throw new Error(`[nuxt-files-sdk:reserved-alias] ${name} must refer to the owned Files SDK.`)
        }
    }
    return { ...selected, ...Object.fromEntries(Object.entries(aliases).filter(([name]) => !(name in selected))) }
}

export const sdkTypePaths = (sdk: PackageInfo): Record<string, string[]> =>
    Object.fromEntries(Object.entries(sdkAliases(sdk, ['types', 'import'])).map(([name, entry]) => [name, [entry]]))
