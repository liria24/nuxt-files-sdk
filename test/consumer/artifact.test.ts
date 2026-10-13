import { createHash } from 'node:crypto'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test'

import { packPackage, readOutput, runCommand } from '../utils/fixture'

let packed: Awaited<ReturnType<typeof packPackage>>
let contents: string[]
let extractedOutput: string
let digest: string
const secret = 'NUXT_FILES_TEST_SECRET_123456'
describe('Packed artifact', () => {
    beforeAll(async () => {
        process.env.NUXT_AWS_SECRET_ACCESS_KEY = secret
        packed = await packPackage()
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
            'package/dist/module.json',
            'package/dist/module.d.ts',
            'package/dist/config.js',
            'package/dist/config.d.ts',
            'package/dist/nitro.js',
            'package/dist/nitro.d.ts',
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
            devDependencies: Record<string, string>
            exports: Record<string, unknown>
            peerDependencies: Record<string, string>
            peerDependenciesMeta: Record<string, { optional?: boolean }>
        }
        expect(Object.keys(packageJson.exports)).toEqual([
            '.',
            './config',
            './nitro',
            './runtime',
            './package.json',
            './module.json',
        ])
        const metadata = JSON.parse(
            await readFile(resolve(packed.directory, 'extracted/package/dist/module.json'), 'utf8'),
        )
        expect(metadata).toMatchObject({
            name: 'nuxt-files-sdk',
            configKey: 'files',
            compatibility: { nuxt: '^4.6.0 || ^5.0.0-0' },
        })
        expect(packageJson.dependencies['files-sdk']).toBe('3.1.0')
        expect(packageJson.devDependencies['files-sdk']).toBeUndefined()
        expect(packageJson.peerDependencies['files-sdk']).toBeUndefined()
        expect(packageJson.peerDependenciesMeta['files-sdk']).toBeUndefined()
        expect(JSON.stringify(packageJson.dependencies)).not.toMatch(/@aws-sdk|@azure|@google-cloud/u)
    })

    test('[SEC-003] packed artifact contains no fixture secret', () => {
        expect(extractedOutput).not.toContain(secret)
    })

    test('[PKG-005] publint and ATTW inspect the exact tarball', async () => {
        await expect(runCommand('bun', ['x', '--no-install', 'publint', packed.tarball])).resolves.toBeTypeOf('string')
        await expect(
            runCommand('bun', ['x', '--no-install', 'attw', packed.tarball, '--profile', 'esm-only']),
        ).resolves.toBeTypeOf('string')
    })

    test('[REL-001] artifact verification never rebuilds or mutates the archive', async () => {
        expect(
            createHash('sha256')
                .update(await readFile(packed.tarball))
                .digest('hex'),
        ).toBe(digest)
    })
})
