import { expect, test } from 'vitest'

import { synchronizeOptionalPeers } from '../../scripts/sync-optional-peers'

test('[PEER-001] synchronizes upstream optional peers without rewriting independent dependencies', () => {
    const manifest = {
        name: 'nuxt-files-sdk',
        version: '1.0.0',
        dependencies: { independent: '^1' },
        peerDependencies: { old: '^1', changed: '^1', required: '^1' },
        peerDependenciesMeta: { old: { optional: true }, changed: { optional: true } },
        filesSdkOptionalPeers: { version: '2.6.1', keys: ['old', 'changed'] },
    }
    const sdk = {
        name: 'files-sdk',
        version: '2.6.2',
        dependencies: { old: '^2' },
        optionalDependencies: { optional: '^1' },
        peerDependencies: { changed: '^2', added: '^3', required: '^1' },
        peerDependenciesMeta: { changed: { optional: true }, added: { optional: true } },
    }
    const result = synchronizeOptionalPeers(manifest, sdk)
    expect(result.peerDependencies).toEqual({ added: '^3', changed: '^2', required: '^1' })
    expect(result.peerDependenciesMeta).toEqual({ added: { optional: true }, changed: { optional: true } })
    expect(result.filesSdkOptionalPeers).toEqual({ version: '2.6.2', keys: ['added', 'changed'] })
    expect(result.dependencies).toEqual(manifest.dependencies)
    expect(manifest.peerDependencies.old).toBe('^1')
    expect(synchronizeOptionalPeers(result, sdk)).toEqual(result)
    expect(() =>
        synchronizeOptionalPeers({ ...manifest, filesSdkOptionalPeers: { version: '', keys: [] } }, sdk),
    ).toThrow('changed')
    expect(() => synchronizeOptionalPeers({ ...manifest, dependencies: { added: '^3' } }, sdk)).toThrow('added')
})
