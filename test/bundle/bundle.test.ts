import { resolve } from 'node:path'

import { beforeAll, describe, expect, test } from 'vitest'

import { directorySize, fixtureDirectory, outputPaths, readOutput, runFixture, unusedPlugins } from '../utils/fixture'

let nuxtOutput = ''
let nitroOutput = ''
let generatedOutput = ''
let paths: string[] = []
let nuxtServerBytes = 0
let nuxtClientBytes = 0
let nitroServerBytes = 0
const secret = 'NUXT_FILES_TEST_SECRET_123456'

describe('Bundle contract', () => {
    beforeAll(async () => {
        process.env.NUXT_AWS_SECRET_ACCESS_KEY = secret
        try {
            await runFixture('nuxt4')
            await runFixture('nitro-v2')
        } finally {
            delete process.env.NUXT_AWS_SECRET_ACCESS_KEY
        }
        const nuxt = fixtureDirectory('nuxt4')
        const nitro = fixtureDirectory('nitro-v2')
        nuxtOutput = await readOutput(resolve(nuxt, '.output'))
        nitroOutput = await readOutput(resolve(nitro, '.output'))
        generatedOutput = await readOutput(resolve(nuxt, '.nuxt/nuxt-files-sdk'))
        paths = [...(await outputPaths(resolve(nuxt, '.output'))), ...(await outputPaths(resolve(nitro, '.output')))]
        ;[nuxtServerBytes, nuxtClientBytes, nitroServerBytes] = await Promise.all([
            directorySize(resolve(nuxt, '.output/server')),
            directorySize(resolve(nuxt, '.output/public')),
            directorySize(resolve(nitro, '.output/server')),
        ])
    })

    test('[BUNDLE-001][BUNDLE-002] server-only Nuxt excludes Vue and development tooling', () => {
        for (const forbidden of ['files-sdk/vue', 'devframe', '@nuxt/devtools-kit', '@vitejs/devtools']) {
            expect(nuxtOutput.includes(forbidden), forbidden).toBe(false)
        }
    })

    test('[BUNDLE-003] fs-only output excludes unrelated native SDKs', () => {
        expect(paths.filter((path) => /node_modules\/(?:@aws-sdk|@azure|@google-cloud)\//u.test(path))).toEqual([])
        expect(generatedOutput).toContain('from "files-sdk/fs"')
        for (const provider of ['appwrite', 'azure', 'gcs', 'google-drive', 'r2', 's3']) {
            expect(generatedOutput).not.toContain(`files-sdk/${provider}`)
        }
        expect(nuxtOutput).not.toContain('files-sdk/loader')
        expect(nitroOutput).not.toContain('files-sdk/loader')
    })

    test('[BUNDLE-004] versioning-only import excludes unrelated built-in plugins', () => {
        expect(nuxtOutput).toMatch(/name:\s*["']versioning["']/u)
        for (const plugin of unusedPlugins) {
            expect(nuxtOutput.includes(`files-sdk/${plugin}`), plugin).toBe(false)
            expect(nuxtOutput, plugin).not.toMatch(new RegExp(`name:\\s*["']${plugin}["']`, 'u'))
            expect(paths.filter((path) => path.includes(`files-sdk/dist/${plugin}/`))).toEqual([])
        }
    })

    test('[BUNDLE-005] standalone Nitro excludes the Nuxt and DevTools runtime graph', () => {
        for (const forbidden of ['@nuxt/kit', 'devframe', '@nuxt/devtools', 'files-sdk/vue']) {
            expect(nitroOutput.includes(forbidden), forbidden).toBe(false)
        }
    })

    test('[BUNDLE-006] measured deployment outputs stay within the v0.0.1 baseline', () => {
        expect(nuxtServerBytes).toBeLessThanOrEqual(3_500_000)
        expect(nuxtClientBytes).toBeLessThanOrEqual(250_000)
        // Initial measurements are reported until the cross-version baseline is stable.
        // oxlint-disable-next-line no-console -- These measurements are the CI size report.
        console.info({ nuxtServerBytes, nuxtClientBytes, nitroServerBytes })
        expect(nitroServerBytes).toBeGreaterThan(0)
    })

    test('[SEC-001] production and generated outputs contain no fixture secret', () => {
        expect(nuxtOutput).not.toContain(secret)
        expect(nitroOutput).not.toContain(secret)
        expect(generatedOutput).not.toContain(secret)
    })
})
