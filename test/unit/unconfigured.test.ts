import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, expect, test, vi } from 'vite-plus/test'

import { loadFilesConfig } from '../../packages/nuxt-files-sdk/src/config/load'
import { prepareFilesConfig } from '../../packages/nuxt-files-sdk/src/config/prepare'
import { reportStorageConfiguration } from '../../packages/nuxt-files-sdk/src/integration/diagnostics'

const directories: string[] = []
afterEach(() => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))))
const configFile = async (source?: string) => {
    const directory = await mkdtemp(resolve(tmpdir(), 'files-unconfigured-'))
    directories.push(directory)
    const configPath = resolve(directory, 'files.config.ts')
    if (source !== undefined) await writeFile(configPath, source)
    return configPath
}

test.each([
    undefined,
    '',
    ' \n // configure later\n /* placeholder */',
    'export default {}',
    'export default defineFilesConfig({})',
    'export default { storage: undefined }',
    'export default { storage: null }',
    'export default { storage: {} }',
])('[CFG-014] missing or empty configuration is inactive: %s', async (source) => {
    const configPath = await configFile(source)
    const onUnconfigured = vi.fn<() => void>()
    const options = {
        configPath,
        environments: ['production'],
        injectImports: async (input: string) => ({ code: `const defineFilesConfig = value => value\n${input}` }),
        onUnconfigured,
    }
    await expect(loadFilesConfig(options)).resolves.toBeUndefined()
    await expect(prepareFilesConfig(options)).resolves.toBeUndefined()
    expect(onUnconfigured).toHaveBeenCalledTimes(2)
})

test('[CFG-014] resolves overrides before classifying storage and keeps inactive environments silent', async () => {
    const configPath = await configFile(`export default {
        storage: { adapter: 'memory' }, $development: { storage: null }
    }`)
    const onUnconfigured = vi.fn<() => void>()
    await expect(
        prepareFilesConfig({ configPath, environments: ['development'], onUnconfigured }),
    ).resolves.toBeUndefined()
    expect(onUnconfigured).toHaveBeenCalledOnce()
    expect((await prepareFilesConfig({ configPath, environments: ['production'], onUnconfigured }))?.adapters).toEqual([
        'memory',
    ])
    await writeFile(configPath, `export default { $test: { storage: { adapter: 'memory' } } }`)
    await expect(
        prepareFilesConfig({ configPath, environments: ['production'], onUnconfigured }),
    ).resolves.toBeUndefined()
    expect(onUnconfigured).toHaveBeenCalledOnce()
    await writeFile(configPath, 'export default { $production: { storage: null } }')
    await expect(
        prepareFilesConfig({ configPath, environments: ['development'], onUnconfigured }),
    ).resolves.toBeUndefined()
    expect(onUnconfigured).toHaveBeenCalledTimes(2)
})

test.each([
    'export default { storage:',
    'throw new Error("authored failure")',
    'import "./missing-import.ts"; export default {}',
    'export default []',
    'export default { storage: [] }',
    'export default { storage: false }',
    'export default { storage: { uploads: null } }',
    'export default { storage: { adapter: "unknown" } }',
])('[CFG-014] real configuration failures remain errors: %s', async (source) => {
    const configPath = await configFile(source)
    const onUnconfigured = vi.fn<() => void>()
    await expect(prepareFilesConfig({ configPath, environments: ['production'], onUnconfigured })).rejects.toThrow(
        /.+/u,
    )
    expect(onUnconfigured).not.toHaveBeenCalled()
})

test('[CFG-014] unreadable entry files are not mistaken for missing configuration', async () => {
    const configPath = await configFile()
    await mkdir(configPath)
    const onUnconfigured = vi.fn<() => void>()
    await expect(prepareFilesConfig({ configPath, environments: [], onUnconfigured })).rejects.toThrow(
        /EISDIR|directory/iu,
    )
    expect(onUnconfigured).not.toHaveBeenCalled()
})

test('[CFG-014] warns once while unconfigured in development and resets after recovery', () => {
    const warn = vi.fn<(message: string) => void>()
    for (let index = 0; index < 2; index++) reportStorageConfiguration('warning-test', true, true, warn)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain('No storage is configured')
    expect(warn.mock.calls[0]![0]).toContain('warning-test')
    reportStorageConfiguration('warning-test', false, true, warn)
    reportStorageConfiguration('warning-test', true, true, warn)
    expect(warn).toHaveBeenCalledTimes(2)
    reportStorageConfiguration('warning-test', true, false, warn)
    expect(warn).toHaveBeenCalledTimes(3)
    reportStorageConfiguration('warning-test', false, true, warn)
})
