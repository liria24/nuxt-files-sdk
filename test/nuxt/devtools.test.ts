import { readFile } from 'node:fs/promises'

import type { Nuxt } from '@nuxt/schema'
import { describe, expect, test, vi } from 'vitest'

import { createFilesDevframe } from '../../packages/nuxt-files-sdk/src/devtools/devframe'
import {
    filesDevtoolsWriteEnabled,
    shouldEnableFilesDevtools,
} from '../../packages/nuxt-files-sdk/src/devtools/enabled'
import { filesDevtoolsOperations } from '../../packages/nuxt-files-sdk/src/devtools/files'
import { setupNuxtV3Devtools } from '../../packages/nuxt-files-sdk/src/devtools/nuxt-v3'
import { setupNuxtV4Devtools } from '../../packages/nuxt-files-sdk/src/devtools/nuxt-v4'

const fakeNuxt = () => {
    const hooks = new Map<string, (...args: never[]) => unknown>()
    return {
        hooks,
        nuxt: {
            hook(name: string, callback: (...args: never[]) => unknown) {
                hooks.set(name, callback)
            },
        } as unknown as Nuxt,
    }
}

const fakeDevtoolsContext = () => {
    type RpcDefinition = { name: string; handler?: (value: unknown) => unknown }
    type DiagnosticHandle = (...args: unknown[]) => unknown
    const rpcDefinitions: RpcDefinition[] = []
    const diagnosticHandles = new Map<string, DiagnosticHandle>()
    const context = {
        commands: { register: vi.fn<(command: unknown) => void>() },
        diagnostics: {
            defineDiagnostics: vi.fn<(input: { codes: Record<string, unknown> }) => Record<string, DiagnosticHandle>>(
                ({ codes }) =>
                    Object.fromEntries(
                        Object.keys(codes).map((code) => {
                            const handle = vi.fn<DiagnosticHandle>()
                            diagnosticHandles.set(code, handle)
                            return [code, handle]
                        }),
                    ),
            ),
            register: vi.fn<(definitions: unknown) => void>(),
        },
        docks: {
            activate: vi.fn<(id: string) => void>(),
            register: vi.fn<(entry: unknown) => void>(),
        },
        host: { mountConnectionMeta: vi.fn<(base: string) => Promise<void>>().mockResolvedValue(undefined) },
        messages: { add: vi.fn<(message: unknown) => Promise<void>>().mockResolvedValue(undefined) },
        services: {
            install: vi.fn<(entry: unknown) => void>(),
            ready: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        },
        scope: vi.fn<() => { rpc: { broadcast: () => Promise<void>; register: (definition: RpcDefinition) => void } }>(
            () => ({
                rpc: {
                    broadcast: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
                    register: vi.fn<(definition: RpcDefinition) => void>((definition) => {
                        rpcDefinitions.push(definition)
                    }),
                },
            }),
        ),
        views: { hostStatic: vi.fn<(base: string, path: string) => void>() },
    }
    return { context, diagnosticHandles, rpcDefinitions }
}

describe('Nuxt DevTools integration', () => {
    test('[DEV-001][SEC-004] follows Nuxt defaults while file writes support explicit opt-out', () => {
        expect(shouldEnableFilesDevtools(true, true, undefined)).toBe(true)
        expect(shouldEnableFilesDevtools(true, {}, undefined)).toBe(true)
        expect(shouldEnableFilesDevtools(true, true, {})).toBe(true)
        expect(shouldEnableFilesDevtools(true, true, true)).toBe(true)
        expect(shouldEnableFilesDevtools(true, true, { enabled: true })).toBe(true)
        expect(shouldEnableFilesDevtools(false, true, { enabled: true })).toBe(false)
        expect(shouldEnableFilesDevtools(true, false, { enabled: true })).toBe(false)
        expect(shouldEnableFilesDevtools(true, true, false)).toBe(false)
        expect(shouldEnableFilesDevtools(true, true, { enabled: false })).toBe(false)
        expect(shouldEnableFilesDevtools(true, { enabled: false }, true)).toBe(false)
        expect(filesDevtoolsWriteEnabled(true)).toBe(true)
        expect(filesDevtoolsWriteEnabled({})).toBe(true)
        expect(filesDevtoolsWriteEnabled({ write: true })).toBe(true)
        expect(filesDevtoolsWriteEnabled({ write: false })).toBe(false)
        expect(filesDevtoolsWriteEnabled({ enabled: false })).toBe(false)
        expect(filesDevtoolsWriteEnabled(false)).toBe(false)
        expect(filesDevtoolsOperations(false)).toEqual(['capabilities', 'list', 'exists', 'download'])
        expect(filesDevtoolsOperations(false)).not.toContain('upload')
        expect(filesDevtoolsOperations(false)).not.toContain('delete')
    })

    test('[DEV-002] v3 registers one legacy iframe tab for the shared UI', () => {
        const { hooks, nuxt } = fakeNuxt()
        setupNuxtV3Devtools(nuxt)
        const tabs: unknown[] = []
        hooks.get('devtools:customTabs')?.(tabs as never)
        expect(tabs).toEqual([
            expect.objectContaining({
                name: 'nuxt-files-sdk',
                view: { type: 'iframe', src: '/__nuxt-files-sdk/' },
            }),
        ])
    })

    test('[DEV-003] v4 registers only the native DevFrame-ready host', async () => {
        const { hooks, nuxt } = fakeNuxt()
        setupNuxtV4Devtools(nuxt, { write: true, maxUploadSize: 10 })
        expect([...hooks.keys()]).toEqual(['devtools:ready'])
        const { context, diagnosticHandles, rpcDefinitions } = fakeDevtoolsContext()
        await hooks.get('devtools:ready')?.(context as never)
        expect(context.host.mountConnectionMeta).toHaveBeenCalledExactlyOnceWith('/__nuxt-files-sdk/')
        expect(context.views.hostStatic).toHaveBeenCalledExactlyOnceWith(
            '/__nuxt-files-sdk/',
            expect.stringMatching(/[/\\]devtools[/\\]client$/u),
        )
        expect(context.docks.register).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                id: 'nuxt-files-sdk',
                type: 'iframe',
                url: '/__nuxt-files-sdk/',
                groupId: 'nuxt',
            }),
        )
        expect(context.commands.register.mock.calls.map(([command]) => (command as { title: string }).title)).toEqual([
            'Files: Open',
            'Files: Refresh',
            'Files: Copy Diagnostics',
        ])
        expect(context.diagnostics.register).toHaveBeenCalledOnce()
        expect(rpcDefinitions.map(({ name }) => name)).toEqual(['report-diagnostics', 'report-failure'])

        rpcDefinitions
            .find(({ name }) => name === 'report-diagnostics')
            ?.handler?.([{ code: 'NUXT_FILES_NOT_CONFIGURED', level: 'warning', message: 'Missing registry.' }])
        expect(diagnosticHandles.get('NUXT_FILES_NOT_CONFIGURED')).toHaveBeenCalledOnce()

        rpcDefinitions
            .find(({ name }) => name === 'report-failure')
            ?.handler?.({
                kind: 'upload',
                message: 'Upload rejected.',
                target: 'file.txt',
            })
        expect(context.messages.add).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Files upload failed', level: 'error', notify: true }),
        )
    })

    test('[SEC-004] read-only DevFrame ignores write failure events', async () => {
        const { context, rpcDefinitions } = fakeDevtoolsContext()
        await createFilesDevframe({
            write: false,
            maxUploadSize: 10,
            notifyFailure: (message) => context.messages.add(message),
        }).setup(context as never)
        rpcDefinitions
            .find(({ name }) => name === 'report-failure')
            ?.handler?.({
                kind: 'delete',
                message: 'Delete rejected.',
                target: 'file.txt',
            })
        expect(context.messages.add).not.toHaveBeenCalled()
    })

    test('[DEV-003] v4 integration relies on the official kit types', async () => {
        const source = await readFile(
            new URL('../../packages/nuxt-files-sdk/src/devtools/nuxt-v4.ts', import.meta.url),
            'utf8',
        )
        expect(source).toContain("from '@nuxt/devtools-kit'")
        expect(source).not.toMatch(/type DevtoolsContext|interface NuxtHooks|declare module '@nuxt\/schema'/u)
    })
})
