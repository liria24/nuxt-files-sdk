import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterAll, expect, test, vi } from 'vitest'

import {
    registerSdkAliases,
    resolveOwnedSdk,
    resolvePackage,
    sdkAliases,
    sdkEntry,
    sdkTypePaths,
} from '../../packages/nuxt-files-sdk/src/integration/resolve'

const directories: string[] = []
const makePackage = async (root: string, name: string, version: string, exports: Record<string, unknown>) => {
    const directory = resolve(root, 'node_modules', name)
    await mkdir(directory, { recursive: true })
    await writeFile(resolve(directory, 'package.json'), JSON.stringify({ name, version, type: 'module', exports }))
    for (const file of ['index.js', 'browser.js', 'index.cjs', 'index.d.ts'])
        await writeFile(resolve(directory, file), '')
    return directory
}
afterAll(() => Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true }))))

test('[RESOLVE-001] resolves the owned SDK and respects public export conditions without logging', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'files 解決 '))
    directories.push(root)
    const owner = resolve(root, 'node_modules/nuxt-files-sdk')
    await mkdir(owner, { recursive: true })
    await makePackage(root, 'files-sdk', '1.0.0', { '.': './index.js' })
    const owned = await makePackage(owner, 'files-sdk', '2.6.2', {
        '.': { types: './index.d.ts', browser: './browser.js', import: './index.js', require: './index.cjs' },
        './versioning': './index.js',
    })
    const from = pathToFileURL(resolve(owner, 'module.js'))
    const sdk = resolveOwnedSdk(from.href)
    expect(sdk.root).toBe(owned)
    expect(sdk.manifest.version).toBe('2.6.2')
    expect(Object.keys(sdkAliases(sdk))).toEqual(['#files-sdk/versioning', '#files-sdk'])
    expect(sdkTypePaths(sdk)['#files-sdk']?.[0]).toContain('/index.d.ts')
    expect(() => registerSdkAliases({ '#files-sdk': '/unrelated-sdk.js' }, sdk)).toThrow('reserved-alias')
    expect(sdkEntry(sdk, 'files-sdk', ['browser', 'import'])).toBe(resolve(owned, 'browser.js').replaceAll('\\', '/'))
    expect(sdkEntry(sdk, 'files-sdk', ['types', 'import'])).toContain('/index.d.ts')
    expect(sdkEntry(sdk, 'files-sdk', ['node', 'require'])).toContain('/index.cjs')
    const stdout = vi.spyOn(process.stdout, 'write')
    const stderr = vi.spyOn(process.stderr, 'write')
    try {
        expect(resolvePackage('files-sdk/private', from)).toMatchObject({
            status: 'unresolved',
            package: { root: owned },
        })
        expect(resolvePackage('missing-files-peer', from).status).toBe('missing')
        expect(stdout).not.toHaveBeenCalled()
        expect(stderr).not.toHaveBeenCalled()
    } finally {
        stdout.mockRestore()
        stderr.mockRestore()
    }
    const peer = await makePackage(owner, 'subpath-only', '1.2.0', { './client': './index.js' })
    expect(resolvePackage('subpath-only', from)).toMatchObject({ status: 'unresolved', package: { root: peer } })
    expect(resolvePackage('subpath-only/client', from).status).toBe('resolved')
    expect(resolvePackage('new-files-peer', from).status).toBe('missing')
    await makePackage(root, 'new-files-peer', '1.0.0', { '.': './index.js' })
    // Adding a dependency must not retain the previous missing result.
    expect(resolvePackage('new-files-peer', from).status).toBe('resolved')
})
