import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { withNuxtEnvironment } from '../../packages/nuxt-files-sdk/src/runtime/registry'

describe('NUXT_ environment bridge', () => {
    beforeEach(() => {
        for (const key of [
            'NUXT_AWS_ACCESS_KEY_ID',
            'AWS_ACCESS_KEY_ID',
            'NUXT_NOT_A_PROVIDER_VARIABLE',
            'NOT_A_PROVIDER_VARIABLE',
        ]) {
            vi.stubEnv(key, undefined)
        }
    })
    afterEach(() => vi.unstubAllEnvs())

    test('[ENV-001][ENV-003] respects native aliases and releases the bridge after rejection', async () => {
        vi.stubEnv('AWS_REGION', undefined)
        vi.stubEnv('AWS_DEFAULT_REGION', 'native-region')
        vi.stubEnv('NUXT_AWS_REGION', 'nuxt-region')
        await withNuxtEnvironment('s3', async () => {
            expect(process.env.AWS_REGION).toBeUndefined()
            expect(process.env.AWS_DEFAULT_REGION).toBe('native-region')
        })
        vi.stubEnv('AWS_DEFAULT_REGION', undefined)
        await expect(
            withNuxtEnvironment('s3', async () => {
                expect(process.env.AWS_REGION).toBe('nuxt-region')
                throw new Error('load failed')
            }),
        ).rejects.toThrow('load failed')
        expect(process.env.AWS_REGION).toBeUndefined()
        await withNuxtEnvironment('s3', async () => {
            expect(process.env.AWS_REGION).toBe('nuxt-region')
        })
        expect(process.env.AWS_REGION).toBeUndefined()
    })

    test('[ENV-001][ENV-002][ENV-003] preserves native precedence, filters aliases, and restores env', async () => {
        process.env.NUXT_AWS_ACCESS_KEY_ID = 'nuxt'
        process.env.NUXT_NOT_A_PROVIDER_VARIABLE = 'ignored'
        await withNuxtEnvironment('s3', async () => {
            expect(process.env.AWS_ACCESS_KEY_ID).toBe('nuxt')
            expect(process.env.NOT_A_PROVIDER_VARIABLE).toBeUndefined()
        })
        expect(process.env.AWS_ACCESS_KEY_ID).toBeUndefined()

        process.env.AWS_ACCESS_KEY_ID = 'native'
        await withNuxtEnvironment('s3', async () => {
            expect(process.env.AWS_ACCESS_KEY_ID).toBe('native')
        })
        expect(process.env.AWS_ACCESS_KEY_ID).toBe('native')
    })

    test('[ENV-004] serializes temporary env injection so concurrent loads cannot observe cleanup', async () => {
        process.env.NUXT_AWS_ACCESS_KEY_ID = 'nuxt'
        const firstStarted = Promise.withResolvers<void>()
        const finishFirst = Promise.withResolvers<void>()
        let secondStarted = false

        const first = withNuxtEnvironment('s3', async () => {
            expect(process.env.AWS_ACCESS_KEY_ID).toBe('nuxt')
            firstStarted.resolve()
            await finishFirst.promise
            expect(process.env.AWS_ACCESS_KEY_ID).toBe('nuxt')
        })
        await firstStarted.promise
        const second = withNuxtEnvironment('s3', async () => {
            secondStarted = true
            expect(process.env.AWS_ACCESS_KEY_ID).toBe('nuxt')
        })
        await Promise.resolve()
        expect(secondStarted).toBe(false)

        finishFirst.resolve()
        await Promise.all([first, second])
        expect(process.env.AWS_ACCESS_KEY_ID).toBeUndefined()
    })
})
