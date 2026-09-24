import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterAll, expect, test } from 'vitest'

import { loadFilesConfig } from '../../packages/nuxt-files-sdk/src/config/load'
import { mergeFilesConfig } from '../../packages/nuxt-files-sdk/src/config/merge'
import { pruneFilesConfigSource } from '../../packages/nuxt-files-sdk/src/config/prune'
import { normalizeFilesConfig } from '../../packages/nuxt-files-sdk/src/runtime/normalize'

const directories: string[] = []
afterAll(() => Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true }))))
const load = async (source: string, environments: string[]) => {
    const directory = await mkdtemp(resolve(tmpdir(), 'files-env-'))
    directories.push(directory)
    const configPath = resolve(directory, 'files.config.mjs')
    await writeFile(configPath, source)
    return loadFilesConfig({ configPath, environments })
}

test('c12 selects base, built-in, custom, and ordered prerender environments', async () => {
    const source = `export default {
      storage: { adapter: 'memory', prefix: 'base' },
      $development: { storage: { adapter: 'fs', config: { root: 'dev' } } },
      $production: { storage: { adapter: 'fs', config: { root: 'production' } } },
      $test: { storage: { adapter: 'memory', prefix: 'test' } },
      $prerender: { storage: { config: { root: 'prerender' } } },
      $env: { staging: { storage: { adapter: 'memory', prefix: 'staging' } } },
    }`
    expect((await load(source, [])).storage).toMatchObject({ adapter: 'memory', prefix: 'base' })
    expect((await load(source, ['development'])).storage).toMatchObject({ adapter: 'fs', config: { root: 'dev' } })
    expect((await load(source, ['production'])).storage).toMatchObject({
        adapter: 'fs',
        config: { root: 'production' },
    })
    expect((await load(source, ['test'])).storage).toMatchObject({ adapter: 'memory', prefix: 'test' })
    expect((await load(source, ['staging'])).storage).toMatchObject({ adapter: 'memory', prefix: 'staging' })
    expect((await load(source, ['production', 'prerender'])).storage).toMatchObject({
        adapter: 'fs',
        config: { root: 'prerender' },
    })
})

test('provider switches discard old config; common options inherit and arrays replace', () => {
    const oldPlugin = { name: 'old' }
    const newPlugin = { name: 'new' }
    const base = {
        storage: {
            adapter: 'r2',
            config: { bucket: 'files', endpoint: 'https://example.com' },
            prefix: 'uploads',
            plugins: [oldPlugin],
        },
        routes: [{ path: '/files', operations: ['list'] }],
    }
    const switched = mergeFilesConfig(
        {
            storage: { adapter: 'fs', config: { root: '.data' }, plugins: [newPlugin] },
            routes: [{ path: '/files', operations: ['list', 'upload'] }],
        },
        base,
    )
    expect(switched.storage).toEqual({
        adapter: 'fs',
        config: { root: '.data' },
        prefix: 'uploads',
        plugins: [newPlugin],
    })
    expect(switched.routes).toEqual([{ path: '/files', operations: ['list', 'upload'] }])
    expect(mergeFilesConfig({ storage: { adapter: 'r2', config: { bucket: 'staging' } } }, base).storage).toMatchObject(
        {
            adapter: 'r2',
            config: { bucket: 'staging', endpoint: 'https://example.com' },
            plugins: [oldPlugin],
        },
    )
})

test('named environments override one storage and add environment-only names', async () => {
    const config = await load(
        `export default {
      storage: { uploads: { adapter: 'memory' }, archive: { adapter: 'memory' } },
      $development: { storage: { uploads: { adapter: 'fs', config: { root: 'uploads' } }, debug: { adapter: 'memory' } } },
    }`,
        ['development'],
    )
    expect([...normalizeFilesConfig(config).keys()]).toEqual(['uploads', 'archive', 'debug'])
    expect(config.storage).toMatchObject({
        uploads: { adapter: 'fs', config: { root: 'uploads' } },
        archive: { adapter: 'memory' },
        debug: { adapter: 'memory' },
    })
    const only = await load(`export default { $test: { storage: { debug: { adapter: 'memory' } } } }`, ['test'])
    expect([...normalizeFilesConfig(only).keys()]).toEqual(['debug'])
    await expect(load(`export default { $test: { storage: { adapter: 'memory' } } }`, ['production'])).rejects.toThrow(
        'At least one storage',
    )
})

test('auto-import injection works and provider resolvers remain lazy', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'files-import-'))
    directories.push(directory)
    const configPath = resolve(directory, 'files.config.ts')
    await writeFile(
        configPath,
        `export default defineFilesConfig({ storage: { adapter: 'fs', config: () => { throw new Error('eager') } } })`,
    )
    const config = await loadFilesConfig({
        configPath,
        environments: ['development'],
        injectImports: async (source) => ({ code: `const defineFilesConfig = (value) => value\n${source}` }),
    })
    expect(typeof (config.storage as { config: unknown }).config).toBe('function')
})

test('generated config source excludes inactive environment literals', () => {
    const source = `import { versioning } from './plugins'\nexport default defineFilesConfig({ storage: { adapter: 'memory' }, $development: { storage: { adapter: 'fs', config: { root: 'DEV_SECRET' } } }, $env: { staging: { storage: { adapter: 'memory', prefix: 'staging' } }, preview: { storage: { adapter: 'memory', prefix: 'PREVIEW_SECRET' } } } })`
    const selected = pruneFilesConfigSource(source, 'E:/project/files.config.ts', ['staging'])
    expect(selected).not.toContain('DEV_SECRET')
    expect(selected).not.toContain('PREVIEW_SECRET')
    expect(selected).toContain("prefix: 'staging'")
    expect(selected).toContain('E:/project/plugins')
})
