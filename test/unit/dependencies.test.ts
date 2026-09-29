import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { PROVIDER_NAMES } from 'files-sdk/providers'
import { expect, test, vi } from 'vitest'

import {
    adapterImports,
    deploymentTarget,
    storageDependencies,
} from '../../packages/nuxt-files-sdk/src/integration/dependencies'
import { subpathDependencies } from '../../packages/nuxt-files-sdk/src/integration/imports'
import { resolveOwnedSdk, sdkEntry } from '../../packages/nuxt-files-sdk/src/integration/resolve'
import { normalizeFilesConfig } from '../../packages/nuxt-files-sdk/src/runtime/normalize'

const dependencies = (adapter: string, config: unknown, preset = 'node-server') =>
    storageDependencies(
        [...normalizeFilesConfig({ storage: { adapter, config } }).values()][0]!,
        deploymentTarget(preset),
    )

test('[DEP-002] adapter import assumptions match the owned SDK, including injected-client paths', () => {
    const sdk = resolveOwnedSdk()
    for (const adapter of PROVIDER_NAMES) {
        expect(
            subpathDependencies(sdk, `files-sdk/${adapter}`)
                .map((entry) => entry.dependency)
                .toSorted(),
            adapter,
        ).toEqual([...adapterImports[adapter]].toSorted())
    }
    expect(subpathDependencies(sdk, 'files-sdk/tracing').map((entry) => entry.dependency)).toContain(
        '@opentelemetry/api',
    )
    expect(subpathDependencies(sdk, 'files-sdk/vue').map((entry) => entry.dependency)).toEqual(['vue'])
})

test('[DEP-001] covers every native adapter and preserves known imports alongside runtime uncertainty', () => {
    expect(Object.keys(adapterImports).toSorted()).toEqual([...PROVIDER_NAMES].toSorted())
    const resolver = vi.fn<() => { client: string }>(() => ({ client: 'fetch' }))
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

test('[DEP-002] reviews only upstream lazy-import selectors, not adapter file operations', () => {
    const sdk = resolveOwnedSdk()
    const dist = resolve(sdk.root, 'dist')
    const engine = readdirSync(dist)
        .filter((name) => name.endsWith('.js'))
        .map((name) => readFileSync(resolve(dist, name), 'utf8'))
        .find((source) => source.includes('var resolveS3Engine ='))!
    expect(engine.match(/var resolveS3Engine =[\s\S]*?\n\};/u)?.[0].replaceAll(/\s+/gu, ' ')).toBe(
        'var resolveS3Engine = (explicit) => { if (explicit) { return explicit; } const g = globalThis; const onWorkerd = g.navigator ? g.navigator.userAgent === "Cloudflare-Workers" : isFunction(g.WebSocketPair); const awsSdkCanParseXml = isFunction(g.DOMParser); return onWorkerd && !awsSdkCanParseXml ? "fetch" : "aws-sdk"; };',
    )
    expect([...engine.matchAll(/import\("(@aws-sdk\/[^"]+)"\)/gu)].map((match) => match[1])).toEqual([
        ...adapterImports.s3,
    ])
    for (const adapter of ['minio', 'rustfs']) {
        const source = readFileSync(sdkEntry(sdk, `files-sdk/${adapter}`), 'utf8')
        expect(source).toContain('if (resolveS3Engine(opts.client) === "fetch") {\n    return s3FetchAdapter(')
        expect(source).toContain('return lazyS3Adapter(')
    }
    const r2 = readFileSync(sdkEntry(sdk, 'files-sdk/r2'), 'utf8')
    expect(r2).toContain('if ("binding" in opts && opts.binding) {\n    return r2FromBinding(opts);')
    expect(r2).toContain('const client = resolveS3Engine(opts.client);\n  if (client === "fetch")')
    const firebase = readFileSync(sdkEntry(sdk, 'files-sdk/firebase-storage'), 'utf8')
    expect(firebase).toContain(
        '("file" in candidate) && isFunction(candidate.file) && ("getFiles" in candidate) && isFunction(candidate.getFiles)',
    )
    expect(firebase).toContain('if (opts.app) {\n    if (isBucket(opts.app)) {\n      return opts.app;')
    expect(firebase).toContain('var loadFirebaseAdminApp = () => require2("firebase-admin/app")')
    expect(firebase).toContain('var loadFirebaseAdminStorage = () => require2("firebase-admin/storage")')
})
