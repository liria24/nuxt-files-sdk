import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, expect, test, vi } from 'vite-plus/test'

import { createFilesConfigEvaluator } from '../../packages/nuxt-files-sdk/src/config/evaluate'
import { loadFilesConfig } from '../../packages/nuxt-files-sdk/src/config/load'
import { registerSdkAliases, resolveOwnedSdk, sdkEntry } from '../../packages/nuxt-files-sdk/src/integration/resolve'

const directories: string[] = []
afterEach(async () => {
    vi.unstubAllGlobals()
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})
const directory = async () => {
    const path = await mkdtemp(resolve(tmpdir(), 'files-config-evaluation-'))
    directories.push(path)
    return path
}
const evaluator = async (alias: Record<string, string> = {}) => {
    const sdk = resolveOwnedSdk()
    return createFilesConfigEvaluator({ alias: registerSdkAliases(alias, sdk), nativeRoots: [sdk.root] })
}

test('owned SDK aliases preserve native exported function identity without invoking factories', async () => {
    const configPath = resolve(await directory(), 'files.config.mjs')
    const sdk = resolveOwnedSdk()
    const native = await import(pathToFileURL(sdkEntry(sdk, 'files-sdk')).href)
    const nativeMemory = await import(pathToFileURL(sdkEntry(sdk, 'files-sdk/memory')).href)
    await writeFile(
        configPath,
        `import { createFiles } from '#files-sdk'
import { memory } from '#files-sdk/memory'
export default { createFiles, memory }`,
    )
    const evaluate = await evaluator()
    const value = (await evaluate(configPath)) as { default: { createFiles: unknown; memory: unknown } }
    expect(value.default.createFiles).toBe(native.createFiles)
    expect(value.default.memory).toBe(nativeMemory.memory)
})

test('Layer aliases retain their own relative origin, re-exports, top-level await and fresh source changes', async () => {
    const root = await directory()
    const layer = resolve(root, 'node_modules', 'example-layer')
    await mkdir(layer, { recursive: true })
    const configPath = resolve(root, 'files.config.ts')
    const helper = resolve(layer, 'policy.mjs')
    const reexport = resolve(layer, 'index.mjs')
    const counter = { helper: 0 }
    vi.stubGlobal('filesConfigRuns', counter)
    await writeFile(reexport, "export { revision, origin } from './policy.mjs'")
    await writeFile(
        configPath,
        `import { revision, origin } from '#layer-policy'
await Promise.resolve()
export default defineFilesConfig({ storage: { adapter: 'memory', prefix: String(revision) }, origin })`,
    )
    const expectedOrigin = pathToFileURL(helper).href
    for (const revision of [1, 2]) {
        await writeFile(
            helper,
            `globalThis.filesConfigRuns.helper++
export const revision = await Promise.resolve(${revision})
export const origin = import.meta.url`,
        )
        const config = await loadFilesConfig({
            configPath,
            environments: ['production'],
            alias: { '#layer-policy': reexport },
            injectImports: async (code) => ({ code: `const defineFilesConfig = (value) => value\n${code}` }),
        })
        expect(config?.storage).toMatchObject({ prefix: String(revision) })
        expect(config).toHaveProperty('origin', expectedOrigin)
        expect(counter.helper).toBe(revision)
    }
})

test('parallel and repeated dynamic imports await one top-level-await helper evaluation', async () => {
    const root = await directory()
    const configPath = resolve(root, 'files.config.mjs')
    const counter = { count: 0 }
    vi.stubGlobal('filesConfigRuns', counter)
    await writeFile(
        resolve(root, 'policy.mjs'),
        `globalThis.filesConfigRuns.count++
await new Promise((resolve) => setTimeout(resolve, 5))
export default { revision: 3 }`,
    )
    await writeFile(
        configPath,
        `const path = './policy.mjs'
const values = await Promise.all([import(path), import(path)])
const repeated = await import(path)
export default [values[0].default.revision, values[1].default.revision, repeated.default.revision]`,
    )
    const evaluate = await evaluator()
    expect((await evaluate(configPath)) as { default: unknown }).toHaveProperty('default', [3, 3, 3])
    expect(counter.count).toBe(1)
})

test('failed imported modules retain the authored error and do not replay within one graph', async () => {
    const root = await directory()
    const configPath = resolve(root, 'files.config.mjs')
    const counter = { count: 0 }
    const error = new Error('authored helper error')
    vi.stubGlobal('filesConfigRuns', counter)
    vi.stubGlobal('filesConfigError', error)
    await writeFile(
        resolve(root, 'policy.mjs'),
        'globalThis.filesConfigRuns.count++; throw globalThis.filesConfigError',
    )
    await writeFile(
        configPath,
        `const path = './policy.mjs'
const failures = await Promise.allSettled([import(path), import(path)])
const later = await import(path).catch((error) => error)
export default [failures[0].reason, failures[1].reason, later]`,
    )
    const evaluate = await evaluator()
    const value = (await evaluate(configPath)) as { default: unknown[] }
    expect(value.default).toEqual([error, error, error])
    expect(counter.count).toBe(1)
})

test('CommonJS and captured require stay synchronous, fresh and share circular partial exports', async () => {
    const root = await directory()
    const configPath = resolve(root, 'files.config.cjs')
    const helper = resolve(root, 'helper.cjs')
    const esm = resolve(root, 'policy.mjs')
    const counter = { count: 0 }
    vi.stubGlobal('filesConfigRuns', counter)
    await writeFile(esm, 'export default { value: 4 }')
    await writeFile(resolve(root, 'cycle.cjs'), "const first = require('./helper.cjs'); exports.value = first.before")
    await writeFile(
        configPath,
        `const captured = require
const helper = captured('./helper.cjs')
const esm = require('./policy.mjs')
module.exports = { helper, value: esm.value, resolved: require.resolve('./helper.cjs'), builtin: typeof require('node:fs').readFileSync }`,
    )
    for (const revision of [1, 2]) {
        await writeFile(
            helper,
            `globalThis.filesConfigRuns.count++
exports.before = ${revision}
const cycle = require('./cycle.cjs')
exports.after = cycle.value`,
        )
        const evaluate = await evaluator()
        const value = (await evaluate(configPath)) as {
            helper: { before: number; after: number }
            value: number
            resolved: string
            builtin: string
        }
        expect(value.helper).toEqual({ before: revision, after: revision })
        expect(value.value).toBe(4)
        expect(value.resolved).toBe(helper)
        expect(value.builtin).toBe('function')
        expect(counter.count).toBe(revision)
    }
})

test('ESM cycles expose Jiti partial exports without deadlocking late reads', async () => {
    const root = await directory()
    const configPath = resolve(root, 'files.config.mjs')
    const counter = { root: 0, helper: 0 }
    vi.stubGlobal('filesConfigRuns', counter)
    await writeFile(
        configPath,
        `import { readValue } from './policy.mjs'
globalThis.filesConfigRuns.root++
export const value = 5
export default { readValue }`,
    )
    await writeFile(
        resolve(root, 'policy.mjs'),
        `import { value } from './files.config.mjs'
globalThis.filesConfigRuns.helper++
export const readValue = () => value`,
    )
    const evaluate = await evaluator()
    const config = (await evaluate(configPath)) as { default: { readValue: () => number } }
    expect(config.default.readValue()).toBe(5)
    expect(counter).toEqual({ root: 1, helper: 1 })
})

test.each(['mjs', 'js', 'ts', 'cjs'])(
    'authored %s root errors run once and preserve their identity',
    async (extension) => {
        const root = await directory()
        const configPath = resolve(root, `files.config.${extension}`)
        const counter = { count: 0 }
        const error = new Error(`authored ${extension} error`)
        vi.stubGlobal('filesConfigRuns', counter)
        vi.stubGlobal('filesConfigError', error)
        await writeFile(resolve(root, 'package.json'), '{"type":"module"}')
        await writeFile(configPath, 'globalThis.filesConfigRuns.count++; throw globalThis.filesConfigError')
        const evaluate = await evaluator()
        await expect(evaluate(configPath)).rejects.toBe(error)
        expect(counter.count).toBe(1)
    },
)

test('caught CommonJS helper failures retain one authored error without replaying the helper', async () => {
    const root = await directory()
    const configPath = resolve(root, 'files.config.cjs')
    const counter = { count: 0 }
    const error = new Error('authored require error')
    vi.stubGlobal('filesConfigRuns', counter)
    vi.stubGlobal('filesConfigError', error)
    await writeFile(
        resolve(root, 'helper.cjs'),
        'globalThis.filesConfigRuns.count++; throw globalThis.filesConfigError',
    )
    await writeFile(
        configPath,
        `const failures = []
for (let attempt = 0; attempt < 2; attempt++) {
    try { require('./helper.cjs') } catch (error) { failures.push(error) }
}
module.exports = { failures }`,
    )
    const evaluate = await evaluator()
    const config = (await evaluate(configPath)) as { failures: unknown[] }
    expect(config.failures).toEqual([error, error])
    expect(counter.count).toBe(1)
})
