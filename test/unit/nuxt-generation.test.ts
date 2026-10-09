import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import type { Nuxt } from '@nuxt/schema'
import { afterEach, expect, test, vi } from 'vite-plus/test'

const kit = vi.hoisted(() => ({
    directory: '',
    templates: new Map<string, { dst: string; getContents: () => string | Promise<string> }>(),
    handlers: [] as Array<{ route: string; handler: { nuxt: string } }>,
    major: 2,
    warn: vi.fn<(message: unknown) => void>(),
    startTask: vi.fn<() => { stop: () => void; update: () => void }>(() => ({ stop: () => {}, update: () => {} })),
}))
vi.mock('@nuxt/kit', () => ({
    addTemplate: (template: { filename: string; getContents: () => string | Promise<string> }) => {
        const result = { ...template, dst: resolve(kit.directory, template.filename) }
        kit.templates.set(template.filename, result)
        return result
    },
    addTypeTemplate: (template: { filename: string; getContents: () => string | Promise<string> }) => {
        const result = { ...template, dst: resolve(kit.directory, template.filename) }
        kit.templates.set(template.filename, result)
        return result
    },
    addServerHandler: (handler: (typeof kit.handlers)[number]) => kit.handlers.push(handler),
    resolveServerVariant: (variants: Record<string, number>) =>
        variants[kit.major === 2 ? 'nitro2' : kit.major === 3 ? 'nitro3' : 'nuxt'],
    useLogger: () => ({ warn: kit.warn }),
    useTerminal: () => ({ startTask: kit.startTask }),
    getAddDependencyCommand: async () => 'npm install --save adapter-sdk',
}))

import { setupNuxtFilesIntegration } from '../../packages/nuxt-files-sdk/src/integration/nuxt'

const directories: string[] = []
const closers: (() => unknown)[] = []
const typeConfig = () => ({ include: [] as string[], compilerOptions: { paths: {} as Record<string, string[]> } })
afterEach(async () => {
    for (const close of closers.splice(0)) await close()
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
    kit.templates.clear()
    kit.handlers.length = 0
    kit.warn.mockClear()
    kit.startTask.mockClear()
})

const setup = async (source: string, major = 2, development = false, nitroAlias: Record<string, string> = {}) => {
    const root = await mkdtemp(resolve(tmpdir(), 'nuxt-files-sdk-nuxt-generation-'))
    directories.push(root)
    kit.directory = resolve(root, '.nuxt')
    kit.major = major
    const configPath = resolve(root, 'files.config.ts')
    await writeFile(configPath, source)
    const hooks = new Map<string, (...args: any[]) => unknown>()
    const nuxt = {
        options: {
            rootDir: root,
            workspaceDir: root,
            buildDir: kit.directory,
            alias: {},
            dev: development,
            envName: development ? 'development' : 'production',
            nitro: { alias: nitroAlias },
        },
        hook: (name: string, callback: (...args: any[]) => unknown) => {
            const previous = hooks.get(name)
            hooks.set(
                name,
                previous
                    ? async (...args) => {
                          await previous(...args)
                          return callback(...args)
                      }
                    : callback,
            )
        },
    } as unknown as Nuxt
    const active = await setupNuxtFilesIntegration(nuxt, { configPath })
    const close = hooks.get('close')
    if (close) closers.push(close)
    return { active, nuxt, hooks, configPath }
}

test('Nuxt generates one shared lazy registry graph without Nitro startup initialization', async () => {
    const { active, nuxt, hooks } = await setup(`export default defineFilesConfig({
        storage: { adapter: 'memory', config: () => { throw new Error('resolved during preparation') } },
        routes: [{ path: '/files', operations: ['list'] }],
    })`)
    expect(active).toBe(true)
    expect(kit.startTask).not.toHaveBeenCalled()
    expect(hooks.has('nitro:init')).toBe(false)
    expect(kit.templates.has('nuxt-files-sdk/plugin.mjs')).toBe(false)
    const registry = await kit.templates.get('nuxt-files-sdk/registry.mjs')!.getContents()
    const runtime = await kit.templates.get('nuxt-files-sdk/runtime.mjs')!.getContents()
    const handler = await kit.templates.get('nuxt-files-sdk/gateway-0.mjs')!.getContents()
    expect(registry).toContain('configureFiles(config,')
    expect(registry.match(/configureFiles\(config,/gu)).toHaveLength(1)
    expect(registry).toContain('from "#files-sdk/memory"')
    expect(registry).not.toContain('files-sdk/loader')
    expect(runtime).toContain("import { registry } from '#nuxt-files-sdk/registry'")
    expect(runtime).toContain('registry.get(name)')
    expect(runtime).toContain("import { sync, transfer } from '#files-sdk'")
    expect(runtime).toContain('sync(files(source), files(destination), options)')
    expect(runtime).toContain('transfer(files(source), files(destination), options)')
    expect(await kit.templates.get('nuxt-files-sdk/runtime.d.ts')!.getContents()).toMatch(
        /export \* from .+runtime\.js/u,
    )
    expect(handler).toContain("import { defineEventHandler, deriveSecret } from 'nuxt/server'")
    expect(handler).toContain("from 'nuxt-files-sdk/runtime'")
    expect(handler).toContain('router.handle(event.req)')
    expect(kit.handlers).toEqual([
        {
            route: '/files',
            handler: { nuxt: kit.templates.get('nuxt-files-sdk/gateway-0.mjs')!.dst.replaceAll('\\', '/') },
        },
    ])
    const config: { plugins: string[]; alias?: Record<string, string> } = { plugins: [] }
    hooks.get('nitro:config')!(config)
    expect(config.plugins).toEqual([])
    expect(config.alias?.['nuxt-files-sdk/runtime']).toBe(nuxt.options.alias['nuxt-files-sdk/runtime'])
})

test.each([0, 2, 3])('development server %s wires only the native Nitro 2 shutdown guard', async (major) => {
    const { hooks } = await setup("export default { storage: { adapter: 'memory' } }", major, true)
    expect(hooks.has('nitro:init')).toBe(major === 2)
    expect(kit.templates.has('nuxt-files-sdk/plugin.dev.mjs')).toBe(false)
    const registry = await kit.templates.get('nuxt-files-sdk/registry.dev.mjs')!.getContents()
    expect(registry).toContain('configureFiles(config,')
})

test('Nuxt restores only missing workerd AWS compatibility after native preset resolution', async () => {
    const { hooks } = await setup(`export default {
        storage: { adapter: 'r2', config: () => { throw new Error('eager config'); } },
        $development: { storage: { adapter: 'fs', config: { root: '.' } } },
    }`)
    const configure = hooks.get('nitro:init')!
    const native = {
        options: {
            preset: 'cloudflare-module',
            alias: { '@aws-sdk/client-s3': '/consumer/custom-client.mjs' } as Record<string, string>,
            virtual: {} as Record<string, string>,
        },
    }
    await configure(native)
    expect(native.options.alias['@aws-sdk/client-s3']).toBe('/consumer/custom-client.mjs')
    expect(Object.keys(native.options.virtual)).toHaveLength(3)
    for (const [name, value] of Object.entries(native.options.virtual)) {
        expect(name).toContain('virtual:nuxt-files-sdk/optional/')
        expect(value).toContain('missing-optional-dependency')
    }
    const node = { options: { preset: 'node-server', alias: {}, virtual: {} } }
    await configure(node)
    expect(node.options.virtual).toEqual({})
    const nitro3 = await setup("export default { storage: { adapter: 'r2' } }", 3)
    const native3 = { options: { preset: 'cloudflare-module', alias: {}, virtual: {} } }
    await nitro3.hooks.get('nitro:init')!(native3)
    expect(native3.options.virtual).toEqual({})
    native.options.preset = 'node-server'
    await configure(native)
    expect(native.options.alias['@aws-sdk/client-s3']).toBe('/consumer/custom-client.mjs')
    expect(native.options.virtual).toEqual({})
})

test('Nuxt preparation retains Nitro-only source aliases without promoting them to client aliases', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'files-nitro-alias-'))
    directories.push(directory)
    const helper = resolve(directory, 'storage.ts')
    await writeFile(helper, "export const storage = { adapter: 'memory' }")
    const { active, nuxt } = await setup(
        "import { storage } from '#server-storage'; export default { storage }",
        2,
        false,
        { '#server-storage': helper },
    )
    expect(active).toBe(true)
    expect(nuxt.options.alias['#server-storage']).toBeUndefined()
})

test('Nuxt rejects Nitro-only reserved aliases before evaluating Files configuration', async () => {
    await expect(
        setup("throw new Error('configuration evaluated before alias validation')", 2, false, {
            '#files-sdk': '/consumer/unowned-sdk.mjs',
        }),
    ).rejects.toThrow('[nuxt-files-sdk:reserved-alias]')
})

test.each([
    "export default { storage: { adapter: 'r2', config: {} } }",
    "export default { storage: { adapter: 'r2', config: () => { throw new Error('eager resolver'); } } }",
])('Nuxt defers AWS advice until the workerd preset and compatibility aliases are resolved', async (source) => {
    const { hooks } = await setup(source)
    expect(kit.warn).not.toHaveBeenCalled()
    await hooks.get('nitro:init')!({
        options: { preset: 'cloudflare-module', alias: {}, virtual: {} },
    })
    expect(kit.warn).not.toHaveBeenCalled()
})

test('Nuxt peer advice uses the native resolved preset and preserves Nitro-only peer aliases', async () => {
    const { hooks } = await setup("export default { storage: { adapter: 'r2', config: {} } }")
    expect(kit.warn).not.toHaveBeenCalled()
    await hooks.get('nitro:init')!({
        options: { preset: 'node-server', alias: { '@aws-sdk/client-s3': '/consumer/custom-client.mjs' } },
    })
    expect(kit.warn).toHaveBeenCalledOnce()
    const message = String(kit.warn.mock.calls[0]![0])
    expect(message).toContain('@aws-sdk/s3-presigned-post')
    expect(message).not.toContain('@aws-sdk/client-s3')
})

test('Nuxt workerd throw shims do not hide confirmed AWS requirements or repeat unchanged advice', async () => {
    const { hooks } = await setup("export default { storage: { adapter: 'r2', config: { client: 'aws-sdk' } } }")
    expect(kit.warn).not.toHaveBeenCalled()
    const native = {
        options: {
            preset: 'cloudflare-module',
            alias: { '@aws-sdk/client-s3': '/consumer/custom-client.mjs' },
            virtual: {},
        },
    }
    await hooks.get('nitro:init')!(native)
    expect(kit.warn).toHaveBeenCalledOnce()
    const message = String(kit.warn.mock.calls[0]![0])
    expect(message).toContain('@aws-sdk/s3-presigned-post')
    expect(message).not.toContain('@aws-sdk/client-s3')
    await hooks.get('nitro:init')!(native)
    expect(kit.warn).toHaveBeenCalledOnce()
})

test('Nuxt public type generation contributes to server, app, shared and node programs', async () => {
    const { hooks, configPath } = await setup(`export default { storage: { adapter: 'memory' } }`)
    const payload = {
        references: [],
        nodeReferences: [],
        sharedReferences: [],
        serverReferences: [],
        tsConfig: typeConfig(),
        nodeTsConfig: typeConfig(),
        sharedTsConfig: typeConfig(),
        serverTsConfig: typeConfig(),
    }
    hooks.get('prepare:types')!(payload)
    expect(payload.serverReferences).toHaveLength(1)
    expect(payload.serverTsConfig.include).toContain(configPath.replaceAll('\\', '/'))
    expect(payload.serverTsConfig.compilerOptions.paths['#files-sdk']).toBeDefined()
    expect(payload.serverTsConfig.compilerOptions.paths['files-sdk']).toBeUndefined()
    expect(payload.serverTsConfig.compilerOptions.paths['nuxt-files-sdk/runtime']?.[0]).toMatch(/runtime\.d\.ts$/u)
    const declarations = await kit.templates.get('nuxt-files-sdk/storage-registry.d.ts')!.getContents()
    expect(declarations).toContain("const useServerFiles: typeof import('nuxt-files-sdk/runtime').useServerFiles")
    expect(declarations).toContain("Return the project's Files client")
})

test('non-Nitro builders retain basic runtime and reject an explicitly configured Gateway', async () => {
    const basic = await setup(`export default { storage: { adapter: 'memory' } }`, 0)
    expect(basic.active).toBe(true)
    expect(await kit.templates.get('nuxt-files-sdk/registry.mjs')!.getContents()).not.toContain('useNitroApp')
    expect(kit.handlers).toEqual([])
    await expect(
        setup(`export default { storage: { adapter: 'memory' }, routes: [{ path: '/files' }] }`, 0),
    ).rejects.toThrow('[nuxt-files-sdk:gateway-unavailable]')
})

test('Gateway secret resolution stays in runtime source and failed derivation can retry', async () => {
    const old = process.env.FILES_API_SECRET
    process.env.FILES_API_SECRET = 'generation-must-not-serialize-this-value'
    try {
        await setup(
            `export default { storage: { adapter: 'memory' }, routes: [{ path: '/files', authorize: () => true }] }`,
        )
        const handler = await kit.templates.get('nuxt-files-sdk/gateway-0.mjs')!.getContents()
        expect(handler).toContain('process.env?.FILES_API_SECRET')
        expect(handler).toContain('deriveSecret("nuxt-files-sdk:gateway:/files")')
        expect(handler).toContain('secretPromise = undefined')
        expect(handler).toContain('const secret = await gatewaySecret()')
        expect(handler).toContain('sharedRouter ??= makeRouter(event, secret)')
        expect(handler).not.toContain(process.env.FILES_API_SECRET)
        expect(handler).not.toContain('randomUUID')
        expect(handler).not.toContain('config.appSecret')
    } finally {
        if (old === undefined) delete process.env.FILES_API_SECRET
        else process.env.FILES_API_SECRET = old
    }
})
