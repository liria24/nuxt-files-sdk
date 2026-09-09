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

    test('[ENV-001][ENV-003] respects native aliases and releases the bridge after a throw', () => {
        vi.stubEnv('AWS_REGION', undefined)
        vi.stubEnv('AWS_DEFAULT_REGION', 'native-region')
        vi.stubEnv('NUXT_AWS_REGION', 'nuxt-region')
        withNuxtEnvironment('s3', () => {
            expect(process.env.AWS_REGION).toBeUndefined()
            expect(process.env.AWS_DEFAULT_REGION).toBe('native-region')
        })
        vi.stubEnv('AWS_DEFAULT_REGION', undefined)
        expect(() =>
            withNuxtEnvironment('s3', () => {
                expect(process.env.AWS_REGION).toBe('nuxt-region')
                throw new Error('load failed')
            }),
        ).toThrow('load failed')
        expect(process.env.AWS_REGION).toBeUndefined()
        withNuxtEnvironment('s3', () => {
            expect(process.env.AWS_REGION).toBe('nuxt-region')
        })
        expect(process.env.AWS_REGION).toBeUndefined()
    })

    test('[ENV-001][ENV-002][ENV-003] preserves native precedence, filters aliases, and restores env', () => {
        process.env.NUXT_AWS_ACCESS_KEY_ID = 'nuxt'
        process.env.NUXT_NOT_A_PROVIDER_VARIABLE = 'ignored'
        withNuxtEnvironment('s3', () => {
            expect(process.env.AWS_ACCESS_KEY_ID).toBe('nuxt')
            expect(process.env.NOT_A_PROVIDER_VARIABLE).toBeUndefined()
        })
        expect(process.env.AWS_ACCESS_KEY_ID).toBeUndefined()

        process.env.AWS_ACCESS_KEY_ID = 'native'
        withNuxtEnvironment('s3', () => {
            expect(process.env.AWS_ACCESS_KEY_ID).toBe('native')
        })
        expect(process.env.AWS_ACCESS_KEY_ID).toBe('native')
    })

    test('[ENV-004] keeps temporary aliases available to nested synchronous construction', () => {
        process.env.NUXT_AWS_ACCESS_KEY_ID = 'nuxt'
        withNuxtEnvironment('s3', () => {
            expect(process.env.AWS_ACCESS_KEY_ID).toBe('nuxt')
            withNuxtEnvironment('s3', () => expect(process.env.AWS_ACCESS_KEY_ID).toBe('nuxt'))
            expect(process.env.AWS_ACCESS_KEY_ID).toBe('nuxt')
        })
        expect(process.env.AWS_ACCESS_KEY_ID).toBeUndefined()
    })
})
