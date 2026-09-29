import { pathToFileURL } from 'node:url'

import { satisfies } from 'verkit'

import type { DependencyRequirement } from './dependencies'
import { resolvePackage, sdkEntry, type PackageInfo } from './resolve'

export interface DependencyDiagnostic extends DependencyRequirement {
    status: 'satisfied' | 'missing' | 'incompatible' | 'unresolved' | 'unknown'
    range?: string
    version?: string
}

/** Resolution and version inspection are silent, even for uncertain aliases and optional operations. */
export const diagnoseDependencies = (
    sdk: PackageInfo,
    requirements: DependencyRequirement[],
    aliases: Record<string, string> = {},
    shims: readonly string[] = [],
): DependencyDiagnostic[] =>
    requirements.map((requirement) => {
        const name = requirement.dependency
            .split('/')
            .slice(0, requirement.dependency.startsWith('@') ? 2 : 1)
            .join('/')
        const range = sdk.manifest.peerDependencies?.[name]
        const base = { ...requirement, ...(range ? { range } : {}) }
        if (requirement.necessity !== 'required') return { ...base, status: 'unknown' }
        if (
            Object.keys(aliases).some(
                (alias) =>
                    !shims.includes(alias) &&
                    (requirement.dependency === alias || requirement.dependency.startsWith(`${alias}/`)),
            )
        ) {
            return { ...base, status: 'unknown' }
        }
        const resolved = resolvePackage(
            requirement.dependency,
            pathToFileURL(sdkEntry(sdk, requirement.subpath)),
            requirement.conditions,
        )
        if (resolved.status !== 'resolved') return { ...base, status: resolved.status }
        const version = resolved.package.manifest.version
        if (!version || !range) return { ...base, status: 'unknown' }
        try {
            return { ...base, version, status: satisfies(version, range) ? 'satisfied' : 'incompatible' }
        } catch {
            return { ...base, status: 'unknown' }
        }
    })

/** The caller retains state across setup, generation and internal worker restarts. */
export const reportDependencyIssues = (
    diagnostics: DependencyDiagnostic[],
    previous: Set<string>,
    warn: (message: string) => void,
): void => {
    const issues = diagnostics.filter(
        (entry) =>
            entry.necessity === 'required' &&
            (entry.status === 'missing' || entry.status === 'incompatible' || entry.status === 'unresolved'),
    )
    const current = new Set(
        issues.map((entry) =>
            JSON.stringify([entry.storage, entry.subpath, entry.dependency, entry.status, entry.range, entry.version]),
        ),
    )
    const fresh = issues.filter(
        (entry) =>
            !previous.has(
                JSON.stringify([
                    entry.storage,
                    entry.subpath,
                    entry.dependency,
                    entry.status,
                    entry.range,
                    entry.version,
                ]),
            ),
    )
    previous.clear()
    for (const key of current) previous.add(key)
    if (!fresh.length) return
    warn(
        `[nuxt-files-sdk:dependencies] ${[
            ...new Set(
                fresh.map((entry) => {
                    const scope = entry.storage === undefined ? entry.subpath : `${entry.storage} (${entry.subpath})`
                    return `${scope}: ${entry.dependency} ${entry.status}${entry.version ? ` (${entry.version})` : ''}; ${entry.status === 'unresolved' ? 'check its public exports and aliases' : `install a version matching ${entry.range}`}`
                }),
            ),
        ].join('\n')}`,
    )
}

const sessions = new Map<string, Set<string>>()
export const dependencySession = (root: string): Set<string> => {
    let state = sessions.get(root)
    if (!state) {
        state = new Set()
        sessions.set(root, state)
    }
    return state
}
