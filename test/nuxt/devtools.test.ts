import type { Nuxt } from '@nuxt/schema'
import { describe, expect, test, vi } from 'vitest'

import { shouldEnableFilesDevtools } from '../../packages/nuxt-files-sdk/src/devtools/enabled'
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

describe('Nuxt DevTools integration', () => {
    test('[DEV-001] disables DevFrame for production, module opt-out, or disabled Nuxt DevTools', () => {
        expect(shouldEnableFilesDevtools(false, true, { enabled: true })).toBe(false)
        expect(shouldEnableFilesDevtools(true, false, { enabled: true })).toBe(false)
        expect(shouldEnableFilesDevtools(true, true, false)).toBe(false)
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
        setupNuxtV4Devtools(nuxt)
        expect([...hooks.keys()]).toEqual(['devtools:ready'])
        const context = {
            docks: { register: vi.fn<(entry: unknown) => void>() },
            services: {
                install: vi.fn<(entry: unknown) => void>(),
                ready: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
            },
            views: { hostStatic: vi.fn<(base: string, path: string) => void>() },
        }
        await hooks.get('devtools:ready')?.(context as never)
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
    })
})
