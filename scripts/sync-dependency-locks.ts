import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

declare const Bun: { semver: { satisfies(version: string, range: string): boolean } }

interface PackageManifest {
    name: string
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

interface LockedPackage {
    dependencies?: Record<string, string> | undefined
    devDependencies?: Record<string, string> | undefined
    peerDependencies?: Record<string, string> | undefined
    optionalPeers?: string[]
}

const root = fileURLToPath(new URL('..', import.meta.url))
const packageManifestPath = join(root, 'packages/nuxt-files-sdk/package.json')

const run = (args: string[], cwd: string) => {
    const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' })
    if (result.status !== 0) process.exit(result.status ?? 1)
}

/** Linked integration fixtures; packed consumers have separate package-manager locks. */
const lockDirectories = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) return []
        const path = join(directory, entry.name)
        if (entry.isDirectory()) return lockDirectories(path)
        return entry.name === 'bun.lock' ? [directory] : []
    })

/** Prefer the file package's own resolution. A hoisted copy can belong to another importer. */
const resolvedVersion = (lock: string, importer: string, name: string) => {
    const escaped = name.replaceAll('/', '\\/')
    const version = (key: string) =>
        lock.match(new RegExp(`"${key.replaceAll('/', '\\/')}": \\["${escaped}@([^"]+)"`, 'u'))?.[1]
    return version(`${importer}/${name}`) ?? version(name)
}

/** Bun keeps a file: manifest snapshot and does not refresh it during --lockfile-only. */
const refreshFilePackageSnapshot = (lockPath: string, manifest: PackageManifest) => {
    const optionalPeers = Object.entries(manifest.peerDependenciesMeta ?? {}).flatMap(([name, meta]) =>
        meta.optional ? [name] : [],
    )
    const lines = readFileSync(lockPath, 'utf8').split('\n')
    let found = false
    const next = lines.map((line) => {
        const prefix = `    "${manifest.name}": [`
        if (!line.startsWith(prefix)) return line
        const entry: [string, LockedPackage] = JSON.parse(line.slice(prefix.length - 1).replace(/,\s*$/u, ''))
        entry[1].dependencies = manifest.dependencies
        entry[1].devDependencies = manifest.devDependencies
        entry[1].peerDependencies = manifest.peerDependencies
        entry[1].optionalPeers = optionalPeers
        found = true
        return `    "${manifest.name}": ${JSON.stringify(entry)},`
    })
    if (!found) throw new Error(`No ${manifest.name} snapshot in ${lockPath}`)
    const updated = next.join('\n')
    if (updated !== lines.join('\n')) writeFileSync(lockPath, updated)
}

const outdatedDependencies = (lockPath: string, manifest: PackageManifest) => {
    const lock = readFileSync(lockPath, 'utf8')
    // Dev dependencies of the file package are not installed into fixtures.
    return Object.entries(manifest.dependencies ?? {}).flatMap(([name, range]) => {
        const version = resolvedVersion(lock, manifest.name, name)
        return version && Bun.semver.satisfies(version, range) ? [] : [name]
    })
}

if (import.meta.main) {
    run(['scripts/sync-optional-peers.ts', '--write'], root)
    // The root lock covers the docs workspace. Fixture locks are separate file: installs.
    run(['install', '--lockfile-only', '--ignore-scripts'], root)
    const manifest: PackageManifest = JSON.parse(readFileSync(packageManifestPath, 'utf8'))
    for (const directory of lockDirectories(join(root, 'test/fixtures')).toSorted()) {
        const lockPath = join(directory, 'bun.lock')
        refreshFilePackageSnapshot(lockPath, manifest)
        const outdated = outdatedDependencies(lockPath, manifest)
        if (outdated.length > 0) {
            run(['update', ...outdated, '--lockfile-only', '--ignore-scripts'], directory)
            assert.deepEqual(
                outdatedDependencies(lockPath, manifest),
                [],
                `Unresolved dependency updates in ${lockPath}`,
            )
        }
    }
    run(['scripts/sync-optional-peers.ts', '--check'], root)
}
