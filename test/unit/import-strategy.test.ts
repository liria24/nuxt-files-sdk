import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, expect, test, vi } from 'vitest'

import { loadFilesConfig } from '../../packages/nuxt-files-sdk/src/config/load'

const directories: string[] = []
afterEach(async () => {
    vi.unstubAllGlobals()
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})
const directory = async () => {
    const path = await mkdtemp(resolve(tmpdir(), 'files-import-strategy-'))
    directories.push(path)
    return path
}

test('[IMPORT-001] native import cannot replace SDK aliases and fresh referenced source evaluation', async () => {
    const root = await directory()
    const configPath = resolve(root, 'files.config.mjs')
    const helper = resolve(root, 'policy.mjs')
    const counter = { count: 0 }
    vi.stubGlobal('filesConfigRuns', counter)
    await writeFile(helper, 'export const revision = await Promise.resolve(1)')
    await writeFile(
        configPath,
        `import { memory } from '#files-sdk/memory'
import { revision } from './policy.mjs'
globalThis.filesConfigRuns.count++
export default { storage: { adapter: memory, prefix: String(revision) } }`,
    )
    await expect(import(pathToFileURL(configPath).href)).rejects.toThrow('#files-sdk/memory')
    expect(counter.count).toBe(0)
    expect((await loadFilesConfig({ configPath, environments: ['production'] }))?.storage).toMatchObject({
        prefix: '1',
    })
    expect(counter.count).toBe(1)
    await writeFile(helper, 'export const revision = await Promise.resolve(2)')
    expect((await loadFilesConfig({ configPath, environments: ['production'] }))?.storage).toMatchObject({
        prefix: '2',
    })
    expect(counter.count).toBe(2)
})

test('a fresh native root URL still caches relative ESM helpers', async () => {
    const root = await directory()
    const configPath = resolve(root, 'files.config.mjs')
    const helper = resolve(root, 'policy.mjs')
    await writeFile(helper, 'export const revision = 1')
    await writeFile(
        configPath,
        `import { revision } from './policy.mjs'
export default { storage: { adapter: 'memory', prefix: String(revision) } }`,
    )
    const native = await import(pathToFileURL(configPath).href)
    expect(native.default.storage.prefix).toBe('1')
    await writeFile(helper, 'export const revision = 2')
    const freshRoot = new URL(pathToFileURL(configPath))
    freshRoot.search = '?reevaluate'
    expect((await import(freshRoot.href)).default.storage.prefix).toBe('1')
    expect((await loadFilesConfig({ configPath, environments: ['production'] }))?.storage).toMatchObject({
        prefix: '2',
    })
})

test('an authored configuration error is evaluated once without native-import fallback', async () => {
    const configPath = resolve(await directory(), 'files.config.mjs')
    const counter = { count: 0 }
    const error = new Error('authored config error')
    vi.stubGlobal('filesConfigRuns', counter)
    vi.stubGlobal('filesConfigError', error)
    await writeFile(configPath, 'globalThis.filesConfigRuns.count++; throw globalThis.filesConfigError')
    await expect(loadFilesConfig({ configPath, environments: ['production'] })).rejects.toBe(error)
    expect(counter.count).toBe(1)
})
