import { PROVIDER_NAMES } from 'files-sdk/providers'
import { expect, test, vi } from 'vitest'

import {
    adapterImports,
    deploymentTarget,
    storageDependencies,
} from '../../packages/nuxt-files-sdk/src/integration/dependencies'
import { normalizeFilesConfig } from '../../packages/nuxt-files-sdk/src/runtime/normalize'
import { subpathDependencies } from '../../packages/nuxt-files-sdk/src/integration/imports'
import { resolveOwnedSdk } from '../../packages/nuxt-files-sdk/src/integration/resolve'

const dependencies = (adapter: string, config: unknown, preset = 'node-server') =>
    storageDependencies(
        [...normalizeFilesConfig({ storage: { adapter, config } }).values()][0]!,
        deploymentTarget(preset),
    )

test('[DEP-002] adapter import assumptions match the owned SDK, including injected-client paths', () => {
    const sdk = resolveOwnedSdk()
    for (const adapter of PROVIDER_NAMES) {
        expect(subpathDependencies(sdk, `files-sdk/${adapter}`).map((entry) => entry.dependency).sort(), adapter)
            .toEqual([...adapterImports[adapter]].sort())
    }
    expect(subpathDependencies(sdk, 'files-sdk/tracing').map((entry) => entry.dependency)).toContain('@opentelemetry/api')
    expect(subpathDependencies(sdk, 'files-sdk/vue').map((entry) => entry.dependency)).toEqual(['vue'])
})

test('[DEP-001] covers every native adapter and preserves known imports alongside runtime uncertainty', () => {
    expect(Object.keys(adapterImports).sort()).toEqual([...PROVIDER_NAMES].sort())
    const resolver = vi.fn(() => ({ client: 'fetch' }))
    expect(dependencies('r2', resolver).every((value) => value.necessity === 'unknown')).toBe(true)
    expect(dependencies('s3', resolver).filter((value) => value.necessity === 'required')).toHaveLength(3)
    expect(resolver).not.toHaveBeenCalled()
    for (const adapter of ['r2', 'minio', 'rustfs']) {
        expect(dependencies(adapter, { client: 'fetch' })).toEqual([])
        expect(
            dependencies(adapter, { client: 'aws-sdk' }, 'cloudflare-module').filter(
                (value) => value.necessity === 'required',
            ),
        ).toHaveLength(3)
        expect(dependencies(adapter, {}, 'cloudflare-module').every((value) => value.necessity === 'unknown')).toBe(
            true,
        )
    }
    expect(dependencies('r2', { binding: {} })).toEqual([])
    expect(dependencies('archil', {})).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ dependency: 'disk' })]),
    )
    expect(dependencies('convex', resolver)).toEqual([])
    expect(dependencies('firebase-storage', { app: { file() {}, getFiles() {} } })).toEqual([])
    expect(dependencies('firebase-storage', { app: {} }).map((value) => value.dependency)).toEqual([
        'firebase-admin/storage',
    ])
    expect(dependencies('firebase-storage', {}).map((value) => value.dependency)).toEqual([
        'firebase-admin/app',
        'firebase-admin/storage',
    ])
    expect(dependencies('firebase-storage', resolver).every((value) => value.necessity === 'unknown')).toBe(true)
    expect(dependencies('google-drive', resolver).every((value) => value.necessity === 'required')).toBe(true)
    expect(dependencies('onedrive', { client: {} }).some((value) => value.dependency === '@azure/identity')).toBe(true)
    expect(dependencies('fs', {})).toEqual([])
    expect(resolver).not.toHaveBeenCalled()
})
