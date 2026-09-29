import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { resolveOwnedSdk, type PackageManifest } from '../packages/nuxt-files-sdk/src/integration/resolve'

interface ManagedManifest extends PackageManifest {
    filesSdkOptionalPeers?: { version: string; keys: string[] }
}

/** Only entries previously managed here may be removed or have their ranges replaced. */
export const synchronizeOptionalPeers = (manifest: ManagedManifest, sdk: PackageManifest): ManagedManifest => {
    const result = structuredClone(manifest)
    const peers = (result.peerDependencies ??= {})
    const meta = (result.peerDependenciesMeta ??= {})
    const managed = new Set(result.filesSdkOptionalPeers?.keys)
    const upstream = Object.entries(sdk.peerDependencies ?? {}).filter(
        ([name]) => sdk.peerDependenciesMeta?.[name]?.optional,
    )
    for (const [name, range] of upstream) {
        if (
            !managed.has(name) &&
            (result.dependencies?.[name] ||
                result.optionalDependencies?.[name] ||
                (peers[name] !== undefined && (peers[name] !== range || meta[name]?.optional !== true)))
        )
            throw new Error(`Optional peer synchronization conflicts with independent declaration: ${name}`)
    }
    for (const name of managed) {
        delete peers[name]
        delete meta[name]
    }
    for (const [name, range] of upstream) {
        peers[name] = range
        meta[name] = { optional: true }
    }
    result.peerDependencies = Object.fromEntries(Object.entries(peers).sort(([a], [b]) => a.localeCompare(b)))
    result.peerDependenciesMeta = Object.fromEntries(Object.entries(meta).sort(([a], [b]) => a.localeCompare(b)))
    result.filesSdkOptionalPeers = { version: sdk.version, keys: upstream.map(([name]) => name).sort() }
    return result
}

if (import.meta.main) {
    const mode = process.argv[2]
    if (mode !== '--write' && mode !== '--check') throw new Error('Use --write or --check.')
    const path = fileURLToPath(new URL('../packages/nuxt-files-sdk/package.json', import.meta.url))
    const source = await readFile(path, 'utf8')
    const manifest = JSON.parse(source) as ManagedManifest
    const synced = synchronizeOptionalPeers(manifest, resolveOwnedSdk().manifest)
    if (mode === '--write') await writeFile(path, `${JSON.stringify(synced, null, 4)}\n`)
    else if (JSON.stringify(manifest) !== JSON.stringify(synced)) {
        throw new Error('Files SDK optional peers are out of sync. Run bun run peers:sync --write.')
    }
}
