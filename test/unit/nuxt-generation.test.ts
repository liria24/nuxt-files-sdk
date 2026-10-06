import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import type { Nuxt } from '@nuxt/schema'
import { afterEach, expect, test, vi } from 'vitest'

const kit = vi.hoisted(() => ({
    directory: '',
    templates: new Map<string, { dst: string; getContents: () => string | Promise<string> }>(),
    handlers: [] as Array<{ route: string; handler: { nuxt: string } }>,
    major: 2,
    warn: vi.fn<(message: unknown) => void>(),
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
    logger: { warn: kit.warn },
}))

import { setupNuxtFilesIntegration } from '../../packages/nuxt-files-sdk/src/integration/nuxt'

const directories: string[] = []
afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
    kit.templates.clear()
    kit.handlers.length = 0
    kit.warn.mockClear()
})

const setup = async (source: string, major = 2) => {
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
            dev: false,
            envName: 'production',
            nitro: {},
        },
        hook: (name: string, callback: (...args: any[]) => unknown) => hooks.set(name, callback),
    } as unknown as Nuxt
    const active = await setupNuxtFilesIntegration(nuxt, { configPath })
    return { active, nuxt, hooks, configPath }
}

test('Nuxt generates one shared lazy registry graph without Nitro startup initialization', async () => {
    const { active, nuxt, hooks } = await setup(`export default defineFilesConfig({
        storage: { adapter: 'memory', config: () => { throw new Error('resolved during preparation') } },
        routes: [{ path: '/files', operations: ['list'] }],
    })`)
    expect(active).toBe(true)
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
    expect(runtime).toContain('void registry')
    expect(handler).toContain("import { defineEventHandler } from 'nuxt/server'")
    expect(handler).toContain("from 'nuxt-files-sdk/runtime'")
    expect(handler).toContain('router.handle(event.req)')
    expect(kit.handlers).toEqual([
        { route: '/files', handler: { nuxt: kit.templates.get('nuxt-files-sdk/gateway-0.mjs')!.dst } },
    ])
    const config: { plugins: string[]; alias?: Record<string, string> } = { plugins: [] }
    hooks.get('nitro:config')!(config)
    expect(config.plugins).toEqual([])
    expect(config.alias?.['nuxt-files-sdk/runtime']).toBe(nuxt.options.alias['nuxt-files-sdk/runtime'])
})

test('Nuxt public type generation contributes to server, app, shared and node programs', async () => {
    const { hooks, configPath } = await setup(`export default { storage: { adapter: 'memory' } }`)
    const config = () => ({ include: [] as string[], compilerOptions: { paths: {} as Record<string, string[]> } })
    const payload = {
        references: [],
        nodeReferences: [],
        sharedReferences: [],
        serverReferences: [],
        tsConfig: config(),
        nodeTsConfig: config(),
        sharedTsConfig: config(),
        serverTsConfig: config(),
    }
    hooks.get('prepare:types')!(payload)
    expect(payload.serverReferences).toHaveLength(1)
    expect(payload.serverTsConfig.include).toContain(configPath)
    expect(payload.serverTsConfig.compilerOptions.paths['#files-sdk']).toBeDefined()
    expect(payload.serverTsConfig.compilerOptions.paths['files-sdk']).toBeUndefined()
    expect(payload.serverTsConfig.compilerOptions.paths['nuxt-files-sdk/runtime']?.[0]).toMatch(/runtime\.d\.ts$/u)
})
