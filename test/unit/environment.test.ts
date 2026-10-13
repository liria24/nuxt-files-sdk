import { memory } from 'files-sdk/memory'
import { listEnvVars } from 'files-sdk/providers'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'

import { withNuxtEnvironment } from '../../packages/nuxt-files-sdk/src/runtime/registry'
import { FilesRegistry } from '../../packages/nuxt-files-sdk/src/runtime/registry'

const variables = listEnvVars('s3').map(({ key, aliases }) => [key, ...(aliases ?? [])])

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
        withNuxtEnvironment(variables, () => {
            expect(process.env.AWS_REGION).toBeUndefined()
            expect(process.env.AWS_DEFAULT_REGION).toBe('native-region')
        })
        vi.stubEnv('AWS_DEFAULT_REGION', undefined)
        expect(() =>
            withNuxtEnvironment(variables, () => {
                expect(process.env.AWS_REGION).toBe('nuxt-region')
                throw new Error('load failed')
            }),
        ).toThrow('load failed')
        expect(process.env.AWS_REGION).toBeUndefined()
        withNuxtEnvironment(variables, () => {
            expect(process.env.AWS_REGION).toBe('nuxt-region')
        })
        expect(process.env.AWS_REGION).toBeUndefined()
    })

    test('[ENV-001][ENV-002][ENV-003] preserves native precedence, filters aliases, and restores env', () => {
        process.env.NUXT_AWS_ACCESS_KEY_ID = 'nuxt'
        process.env.NUXT_NOT_A_PROVIDER_VARIABLE = 'ignored'
        withNuxtEnvironment(variables, () => {
            expect(process.env.AWS_ACCESS_KEY_ID).toBe('nuxt')
            expect(process.env.NOT_A_PROVIDER_VARIABLE).toBeUndefined()
        })
        expect(process.env.AWS_ACCESS_KEY_ID).toBeUndefined()

        process.env.AWS_ACCESS_KEY_ID = 'native'
        withNuxtEnvironment(variables, () => {
            expect(process.env.AWS_ACCESS_KEY_ID).toBe('native')
        })
        expect(process.env.AWS_ACCESS_KEY_ID).toBe('native')
    })

    test('[ENV-004] keeps temporary aliases available to nested synchronous construction', () => {
        process.env.NUXT_AWS_ACCESS_KEY_ID = 'nuxt'
        withNuxtEnvironment(variables, () => {
            expect(process.env.AWS_ACCESS_KEY_ID).toBe('nuxt')
            withNuxtEnvironment(variables, () => expect(process.env.AWS_ACCESS_KEY_ID).toBe('nuxt'))
            expect(process.env.AWS_ACCESS_KEY_ID).toBe('nuxt')
        })
        expect(process.env.AWS_ACCESS_KEY_ID).toBeUndefined()
    })

    test('passes NUXT_ S3 credentials to a provider that reads after construction', async () => {
        vi.stubEnv('NUXT_AWS_ACCESS_KEY_ID', 'nuxt-access')
        vi.stubEnv('NUXT_AWS_SECRET_ACCESS_KEY', 'nuxt-secret')
        vi.stubEnv('NUXT_AWS_SESSION_TOKEN', 'nuxt-session')
        vi.stubEnv('AWS_SESSION_TOKEN', 'native-session')
        vi.stubEnv('AWS_SECRET_ACCESS_KEY', undefined)
        let delayedRead!: () => Promise<unknown>
        const registry = new FilesRegistry(
            { storage: { adapter: 's3', config: { bucket: 'test', region: 'us-east-1' } } },
            {
                factories: {
                    s3: (input) => {
                        const options = input as { credentials?: unknown }
                        delayedRead = async () => (await Promise.resolve(), options.credentials)
                        return memory()
                    },
                },
                environment: { s3: [] },
            },
        )
        registry.get()
        expect(process.env.AWS_ACCESS_KEY_ID).toBeUndefined()
        expect(await delayedRead()).toEqual({
            accessKeyId: 'nuxt-access',
            secretAccessKey: 'nuxt-secret',
            sessionToken: 'native-session',
        })

        vi.stubEnv('AWS_ACCESS_KEY_ID', 'native-access')
        let nativeOptions: unknown
        new FilesRegistry(
            { storage: { adapter: 's3', config: { bucket: 'test', region: 'us-east-1' } } },
            { factories: { s3: (input) => ((nativeOptions = input), memory()) } },
        ).get()
        expect(nativeOptions).not.toHaveProperty('credentials')
    })

    test.each([
        { nuxtService: 'https://nuxt-s3.test', expected: 'https://nuxt-s3.test' },
        { nuxtService: 'https://nuxt-s3.test', explicit: undefined, expected: 'https://nuxt-s3.test' },
        { nuxtGlobal: 'https://nuxt-global.test', expected: 'https://nuxt-global.test' },
        {
            nuxtService: 'https://nuxt-s3.test',
            nuxtGlobal: 'https://nuxt-global.test',
            expected: 'https://nuxt-s3.test',
        },
        {
            nuxtService: 'https://nuxt-s3.test',
            nativeGlobal: 'https://native-global.test',
            expected: 'https://native-global.test',
        },
        {
            nuxtGlobal: 'https://nuxt-global.test',
            nativeService: 'https://native-s3.test',
            expected: 'https://native-s3.test',
        },
        {
            nativeService: 'https://native-s3.test',
            nativeGlobal: 'https://native-global.test',
            expected: 'https://native-s3.test',
        },
        { nuxtService: 'https://nuxt-s3.test', explicit: 'https://explicit.test', expected: 'https://explicit.test' },
        {
            nativeService: 'https://native-s3.test',
            explicit: 'https://explicit.test',
            expected: 'https://explicit.test',
        },
    ])('[ENV-001][ENV-003][ENV-005] captures the S3 endpoint for delayed reads: $expected', async (values) => {
        const { nuxtService, nuxtGlobal, nativeService, nativeGlobal, explicit, expected } = values as {
            nuxtService?: string
            nuxtGlobal?: string
            nativeService?: string
            nativeGlobal?: string
            explicit?: string
            expected: string
        }
        vi.stubEnv('NUXT_AWS_ENDPOINT_URL_S3', nuxtService)
        vi.stubEnv('NUXT_AWS_ENDPOINT_URL', nuxtGlobal)
        vi.stubEnv('AWS_ENDPOINT_URL_S3', nativeService)
        vi.stubEnv('AWS_ENDPOINT_URL', nativeGlobal)
        const input = Object.freeze({
            bucket: 'fixture',
            region: 'us-east-1',
            credentials: { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' },
            ...('explicit' in values ? { endpoint: explicit } : {}),
        })
        let delayedRead!: () => Promise<unknown>
        new FilesRegistry(
            { storage: { adapter: 's3', config: () => input } },
            {
                environment: { s3: variables },
                factories: {
                    s3: (config) => {
                        delayedRead = async () => config
                        return memory()
                    },
                },
            },
        ).get()
        expect(process.env.AWS_ENDPOINT_URL_S3).toBe(nativeService)
        expect(process.env.AWS_ENDPOINT_URL).toBe(nativeGlobal)
        expect(await delayedRead()).toEqual({ ...input, endpoint: expected })
        expect(input.endpoint).toBe(explicit)
    })

    test('maps Bun S3 chain aliases to options without changing process.env', () => {
        vi.stubEnv('NUXT_S3_ACCESS_KEY_ID', 'nuxt-access')
        vi.stubEnv('NUXT_S3_SECRET_ACCESS_KEY', 'nuxt-secret')
        vi.stubEnv('S3_REGION', 'native-region')
        vi.stubEnv('NUXT_AWS_REGION', 'nuxt-region')
        let options: unknown
        new FilesRegistry(
            { storage: { adapter: 'bun-s3' } },
            { factories: { 'bun-s3': (input) => ((options = input), memory()) } },
        ).get()
        expect(options).toEqual({ accessKeyId: 'nuxt-access', secretAccessKey: 'nuxt-secret' })
        expect(process.env.AWS_ACCESS_KEY_ID).toBeUndefined()
        expect(process.env.S3_ACCESS_KEY_ID).toBeUndefined()
    })
})
