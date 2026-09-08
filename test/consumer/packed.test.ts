import { createHash } from 'node:crypto'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { invalidTypeCases } from '../types/invalid/cases'
import {
    copyPackedConsumer,
    outputPaths,
    packPackage,
    readOutput,
    runCommand,
    startFixtureServer,
    unusedPlugins,
} from '../utils/fixture'
import {
    checkPublicExamples,
    checkGeneratedTypes,
    checkInvalidType,
    cleanTypeContracts,
} from '../utils/generated-types'

let packed: Awaited<ReturnType<typeof packPackage>>
let contents: string[]
let extractedOutput: string
let digest: string
const secret = 'NUXT_FILES_TEST_SECRET_123456'

describe('Packed consumer', () => {
    beforeAll(async () => {
        process.env.NUXT_AWS_SECRET_ACCESS_KEY = secret
        try {
            packed = await packPackage()
        } finally {
            delete process.env.NUXT_AWS_SECRET_ACCESS_KEY
        }
        contents = (await runCommand('tar', ['-tf', packed.tarball])).trim().split(/\r?\n/u)
        const extracted = resolve(packed.directory, 'extracted')
        await mkdir(extracted, { recursive: true })
        await runCommand('tar', ['-xf', packed.tarball, '-C', extracted])
        extractedOutput = await readOutput(extracted)
        digest = createHash('sha256')
            .update(await readFile(packed.tarball))
            .digest('hex')
    })

    afterAll(async () => {
        delete process.env.NUXT_AWS_SECRET_ACCESS_KEY
        if (packed) await rm(packed.directory, { recursive: true, force: true })
    })

    test('[PKG-001][PKG-002] tarball contains only the declared release files', () => {
        for (const required of [
            'package/package.json',
            'package/LICENSE',
            'package/README.md',
            'package/dist/module.js',
            'package/dist/module.d.ts',
            'package/dist/config.js',
            'package/dist/config.d.ts',
            'package/dist/nitro.js',
            'package/dist/nitro.d.ts',
            'package/dist/plugins.js',
            'package/dist/plugins.d.ts',
            'package/dist/runtime.js',
            'package/dist/runtime.d.ts',
        ]) {
            expect(contents).toContain(required)
        }
        for (const path of contents) {
            expect(path).toMatch(/^package\/(?:dist\/|package\.json$|README(?:\.md)?$|LICEN[CS]E(?:\.md)?$)/u)
            expect(path).not.toMatch(/^package\/(?:src|test|fixtures|\.git|\.data)(?:\/|$)/u)
        }
    })

    test('[PKG-003] packed public exports and dependency boundary are exact', async () => {
        const packageJson = JSON.parse(
            await readFile(resolve(packed.directory, 'extracted/package/package.json'), 'utf8'),
        ) as {
            dependencies: Record<string, string>
            exports: Record<string, unknown>
        }
        expect(Object.keys(packageJson.exports)).toEqual([
            '.',
            './config',
            './nitro',
            './plugins',
            './runtime',
            './package.json',
        ])
        expect(JSON.stringify(packageJson.dependencies)).not.toMatch(/@aws-sdk|@azure|@google-cloud/u)
    })

    test('[SEC-003] packed artifact contains no fixture secret', () => {
        expect(extractedOutput).not.toContain(secret)
    })

    test('[PKG-005] publint and ATTW inspect the exact tarball', async () => {
        await expect(runCommand('bun', ['x', 'publint', packed.tarball])).resolves.toBeTypeOf('string')
        await expect(runCommand('bun', ['x', 'attw', packed.tarball, '--profile', 'esm-only'])).resolves.toBeTypeOf(
            'string',
        )
    })

    test.each(['nuxt4', 'nitro-v2', 'nitro-v3'])(
        '[PKG-004] %s installs the exact tarball and passes public contracts',
        async (name) => {
            const consumer = await copyPackedConsumer(name, packed.directory, packed.tarball)
            await runCommand('bun', ['install', '--ignore-scripts'], { cwd: consumer })
            for (const script of ['prepare', 'typecheck', 'build']) {
                const log = await runCommand('bun', ['run', script], {
                    cwd: consumer,
                    env: { NUXT_AWS_SECRET_ACCESS_KEY: secret },
                })
                expect(log.includes(secret), `${name} ${script} log`).toBe(false)
            }
            if (name === 'nuxt4') {
                await checkGeneratedTypes(consumer)
                for (const entry of invalidTypeCases) await checkInvalidType(consumer, entry)
                await checkPublicExamples(consumer)
                await cleanTypeContracts(consumer)
            }
            const paths = await outputPaths(resolve(consumer, '.output'))
            const output = await readOutput(resolve(consumer, '.output'))
            const runtime = await readOutput(resolve(consumer, '.output'), true)
            const generated = await readOutput(
                resolve(consumer, name === 'nuxt4' ? '.nuxt/nuxt-files-sdk' : '.nitro/nuxt-files-sdk'),
            )
            expect((output + generated).includes(secret), `${name} secret leakage`).toBe(false)
            expect(paths.filter((path) => /node_modules\/(?:@aws-sdk|@azure|@google-cloud)\//u.test(path))).toEqual([])
            expect(runtime).toMatch(/name:\s*["']versioning["']/u)
            for (const plugin of unusedPlugins) {
                expect(runtime, `${name}: ${plugin}`).not.toMatch(new RegExp(`name:\\s*["']${plugin}["']`, 'u'))
                expect(paths.filter((path) => path.includes(`files-sdk/dist/${plugin}/`))).toEqual([])
            }
            for (const forbidden of [
                'files-sdk/vue',
                'devframe',
                '@nuxt/devtools',
                ...(name === 'nuxt4' ? [] : ['@nuxt/kit']),
            ]) {
                expect(runtime.includes(forbidden), `${name}: ${forbidden}`).toBe(false)
            }
            expect(paths.filter((path) => /node_modules\/(?:@nuxt\/(?:kit|devtools)|devframe)\//u.test(path))).toEqual(
                [],
            )
            const dependencies = await outputPaths(resolve(consumer, 'node_modules'))
            expect(dependencies.some((path) => /(?:^|\/)nuxt\/package.json$/u.test(path))).toBe(name === 'nuxt4')
            const server = await startFixtureServer(consumer)
            try {
                const response = await fetch(`${server.url}/${name === 'nuxt4' ? 'api/' : ''}files`)
                expect(response.status).toBe(200)
                expect(await response.json()).toMatchObject({ adapter: 'fs' })
            } finally {
                await server.close()
            }
        },
    )

    test('[REL-001] consumer verification never rebuilds or mutates the release tarball', async () => {
        const after = createHash('sha256')
            .update(await readFile(packed.tarball))
            .digest('hex')
        expect(after).toBe(digest)
    })
})
