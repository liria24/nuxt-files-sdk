import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { invalidTypeCases } from '../types/invalid/cases'
import { withConsumerSession } from '../utils/consumer-session'
import {
    copyPackedConsumer,
    nuxtBuildDirectory,
    outputPaths,
    packPackage,
    readOutput,
    runCommand,
    startFixtureServer,
    unusedPlugins,
} from '../utils/fixture'
import { assertGatewayListing } from '../utils/gateway'
import {
    checkGeneratedTypes,
    checkHoverDocumentation,
    checkInvalidType,
    checkPublicExamples,
    cleanTypeContracts,
} from '../utils/generated-types'
import { runPackedNuxtCliSession } from '../utils/packed-cli-session'

let packed: Awaited<ReturnType<typeof packPackage>>
let contents: string[]
let extractedOutput: string
let digest: string
const secret = 'NUXT_FILES_TEST_SECRET_123456'
const requestedPackageManager = process.env.NUXT_FILES_PACKAGE_MANAGER ?? 'bun'
if (!['bun', 'npm', 'pnpm'].includes(requestedPackageManager)) {
    throw new Error(`Unsupported package manager: ${requestedPackageManager}`)
}
const packageManager = requestedPackageManager as 'bun' | 'npm' | 'pnpm'
const packageManagerShell = process.platform === 'win32' && packageManager !== 'bun'
const consumerFixtures = packageManager === 'bun' ? ['nuxt4', 'nitro-v2', 'nitro-v3'] : ['nuxt4']
if (packageManager === 'pnpm') consumerFixtures.push('workspace')
const installConsumer = (
    directory: string,
    options: { signal?: AbortSignal; timeout?: number } = {},
): Promise<string> =>
    packageManager === 'bun'
        ? runCommand('bun', ['install', '--ignore-scripts'], { cwd: directory, ...options })
        : packageManager === 'npm'
          ? runCommand(packageManager, ['install', '--ignore-scripts', '--package-lock=false'], {
                cwd: directory,
                shell: packageManagerShell,
                ...options,
            })
          : runCommand(packageManager, ['install', '--ignore-scripts', '--no-frozen-lockfile'], {
                cwd: directory,
                shell: packageManagerShell,
                ...options,
            })
const runConsumerScript = (
    directory: string,
    script: string,
    options: { signal?: AbortSignal; timeout?: number } = {},
): Promise<string> =>
    runCommand(packageManager, ['run', script], {
        cwd: directory,
        env: { NUXT_AWS_SECRET_ACCESS_KEY: secret },
        shell: packageManagerShell,
        ...options,
    })

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
        expect(packageJson.dependencies['files-sdk']).toBe('2.6.2')
        expect(packageJson.devDependencies['files-sdk']).toBeUndefined()
        expect(packageJson.peerDependencies['files-sdk']).toBeUndefined()
        expect(packageJson.peerDependenciesMeta['files-sdk']).toBeUndefined()
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

    test('[CLI-002][GATEWAY-006] exact archive runs the real CLI lifecycle and portable gateway boundaries', async () => {
        const consumer = await copyPackedConsumer('nuxt4', resolve(packed.directory, 'cli-input'), packed.tarball)
        if (packageManager === 'pnpm') {
            await writeFile(resolve(consumer, '.npmrc'), 'hoist=false\nshamefully-hoist=false\n')
        }
        const report = await runPackedNuxtCliSession({
            consumer,
            install: installConsumer,
            runScript: runConsumerScript,
        })
        expect(report.cli).toMatch(/^4\./u)
        expect(report.localReferenceUpdated).toBe(true)
        expect(report.aliasLayerRelativeUpdated).toBe(true)
        expect(report.installOnlyRecovery).toBe(true)
        if (report.disconnectAbort.status === 'upstream-limitation') {
            // The real probe ran; preserve the actual native-adapter limitation in CI output.
            // oxlint-disable-next-line no-console
            console.info(`[Packed Nuxt CLI] ${report.disconnectAbort.detail}`)
        }
    }, 600_000)

    test.for(consumerFixtures)(
        '[PKG-004][RESOLVE-002] %s installs the exact tarball and passes public contracts',
        async (layout, context) =>
            withConsumerSession(context, `${packageManager}:${layout}`, async ({ signal, stage }) => {
                const name = layout === 'workspace' ? 'nuxt4' : layout
                const parent = layout === 'workspace' ? resolve(packed.directory, 'workspace') : packed.directory
                const consumer = await stage('copy consumer', () => copyPackedConsumer(name, parent, packed.tarball))
                const consumerPackage = JSON.parse(await readFile(resolve(consumer, 'package.json'), 'utf8')) as {
                    dependencies: Record<string, string>
                    devDependencies: Record<string, string>
                }
                expect(consumerPackage.dependencies['files-sdk']).toBeUndefined()
                let frameworkDependencies: Record<string, string> | undefined
                if (packageManager === 'pnpm') {
                    await writeFile(resolve(consumer, '.npmrc'), 'hoist=false\nshamefully-hoist=false\n')
                    // Strict non-hoisting also exposes Nuxt's undeclared c12/unplugin imports.
                    // Keep these framework dependencies explicit, including for workspace Layers.
                    frameworkDependencies = Object.fromEntries(
                        ['c12', 'unplugin', '@types/node'].map((dependency) => [
                            dependency,
                            consumerPackage.devDependencies[dependency]!,
                        ]),
                    )
                }
                if (layout === 'workspace') {
                    await writeFile(
                        resolve(parent, 'package.json'),
                        JSON.stringify({
                            private: true,
                            name: 'files-workspace',
                            devDependencies: frameworkDependencies,
                        }),
                    )
                    await writeFile(resolve(parent, 'pnpm-workspace.yaml'), 'packages:\n  - nuxt4\n  - layer\n')
                    await writeFile(resolve(parent, '.npmrc'), 'hoist=false\nshamefully-hoist=false\n')
                    const layer = resolve(parent, 'layer')
                    await mkdir(layer, { recursive: true })
                    await writeFile(
                        resolve(layer, 'package.json'),
                        JSON.stringify({
                            name: 'files-test-layer',
                            private: true,
                            dependencies: { 'files-sdk': '2.6.0' },
                        }),
                    )
                    await writeFile(
                        resolve(layer, 'nuxt.config.ts'),
                        `import { fileURLToPath } from 'node:url'\nexport default defineNuxtConfig({ alias: { '@files-layer': fileURLToPath(new URL('.', import.meta.url)) } })`,
                    )
                    await writeFile(
                        resolve(layer, 'plugins.ts'),
                        `import { versioning } from '#files-sdk/versioning'\nexport const plugins = [versioning()]`,
                    )
                    const nuxtConfig = resolve(consumer, 'nuxt.config.ts')
                    await writeFile(
                        nuxtConfig,
                        (await readFile(nuxtConfig, 'utf8')).replace(
                            "modules: ['nuxt-files-sdk'],",
                            "modules: ['nuxt-files-sdk'], extends: ['../layer'],",
                        ),
                    )
                    const filesConfig = resolve(consumer, 'files.config.ts')
                    await writeFile(
                        filesConfig,
                        (await readFile(filesConfig, 'utf8'))
                            .replace(
                                "import { versioning } from '#files-sdk/versioning'",
                                "import { plugins } from '@files-layer/plugins'",
                            )
                            .replace('plugins: [versioning()]', 'plugins'),
                    )
                    consumerPackage.dependencies['files-sdk'] = '2.6.0'
                    await writeFile(resolve(consumer, 'package.json'), JSON.stringify(consumerPackage, null, 2))
                }
                await stage('install', () => installConsumer(consumer, { signal }))
                const installed = JSON.parse(
                    await stage('owned SDK resolution', () =>
                        runCommand(
                            'node',
                            [
                                '--input-type=module',
                                '-e',
                                `const { resolveOwnedSdk } = await import(new URL('./dist/integration/resolve.js', import.meta.resolve('nuxt-files-sdk/package.json'))); const sdk = resolveOwnedSdk(); console.log(JSON.stringify({ path: sdk.manifestPath, version: sdk.manifest.version, bare: ${layout === 'workspace' ? 'resolveOwnedSdk(import.meta.url).manifest.version' : 'null'} }))`,
                            ],
                            { cwd: consumer, signal },
                        ),
                    ),
                ) as { path: string; version: string; bare: string | null }
                expect(installed.version).toBe('2.6.2')
                expect(installed.bare).toBe(layout === 'workspace' ? '2.6.0' : null)
                const runtimeExports = await stage('runtime exports', () =>
                    runCommand(
                        'node',
                        [
                            '--input-type=module',
                            '-e',
                            "import * as runtime from 'nuxt-files-sdk/runtime'; console.log(JSON.stringify(Object.keys(runtime)))",
                        ],
                        { cwd: consumer, signal },
                    ),
                )
                expect(JSON.parse(runtimeExports.trim())).toEqual(['syncFiles', 'transferFiles', 'useServerFiles'])
                const scripts = name === 'nitro-v3' ? ['build', 'typecheck'] : ['prepare', 'typecheck', 'build']
                for (const script of scripts) {
                    const log = await stage(script, () => runConsumerScript(consumer, script, { signal }))
                    expect(log.includes(secret), `${name} ${script} log`).toBe(false)
                }
                if (name === 'nuxt4') {
                    await stage('native generated declarations', () => checkGeneratedTypes(consumer, { signal }))
                    for (const entry of invalidTypeCases)
                        await stage(`negative ${entry.id}`, () => checkInvalidType(consumer, entry, { signal }))
                    await stage('public examples', () => checkPublicExamples(consumer, { signal }))
                    await stage('hover documentation', () => checkHoverDocumentation(consumer, { signal }))
                    await stage('type contract cleanup', () => cleanTypeContracts(consumer))
                }
                const paths = await stage('output paths', () => outputPaths(resolve(consumer, '.output')))
                const output = await stage('output scan', () => readOutput(resolve(consumer, '.output')))
                const runtime = await stage('runtime scan', () => readOutput(resolve(consumer, '.output'), true))
                expect(runtime).not.toContain('#files-sdk')
                expect(runtime).not.toContain(consumer.replaceAll('\\', '/'))
                const generated = await readOutput(
                    resolve(
                        consumer,
                        name === 'nuxt4'
                            ? resolve(await nuxtBuildDirectory(consumer), 'nuxt-files-sdk')
                            : name === 'nitro-v3'
                              ? 'node_modules/.nitro/nuxt-files-sdk'
                              : '.nitro/nuxt-files-sdk',
                    ),
                )
                expect((output + generated).includes(secret), `${name} secret leakage`).toBe(false)
                expect(paths.filter((path) => /node_modules\/(?:@aws-sdk|@azure|@google-cloud)\//u.test(path))).toEqual(
                    [],
                )
                expect(runtime).toMatch(/name:\s*["'\x60]versioning["'\x60]/u)
                for (const plugin of unusedPlugins) {
                    expect(runtime, `${name}: ${plugin}`).not.toMatch(
                        new RegExp(`name:\\s*["'\\x60]${plugin}["'\\x60]`, 'u'),
                    )
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
                expect(
                    paths.filter((path) => /node_modules\/(?:@nuxt\/(?:kit|devtools)|devframe)\//u.test(path)),
                ).toEqual([])
                const dependencies = await stage('installed package paths', () =>
                    outputPaths(resolve(consumer, 'node_modules')),
                )
                expect(dependencies.some((path) => /(?:^|\/)nuxt\/package.json$/u.test(path))).toBe(name === 'nuxt4')
                const server = await stage('server readiness', () => startFixtureServer(consumer, { signal }))
                try {
                    const response = await stage('HTTP files', () =>
                        fetch(`${server.url}/${name === 'nuxt4' ? 'api/' : ''}files`, {
                            signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
                        }),
                    )
                    expect(response.status).toBe(200)
                    expect(await response.json()).toMatchObject({ adapter: 'fs' })
                    if (name === 'nuxt4') {
                        await stage('HTTP gateway', () =>
                            assertGatewayListing(`${server.url}/api/gateway`, [], undefined, signal),
                        )
                    }
                    const identity =
                        name === 'nuxt4'
                            ? await stage('HTTP SDK identity', () =>
                                  fetch(`${server.url}/api/sdk-identity`, {
                                      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
                                  }).then((result) => result.json()),
                              )
                            : null
                    expect(identity).toEqual(name === 'nuxt4' ? { owned: true } : null)
                } finally {
                    await stage('server shutdown', () => server.close(), true)
                }
            }),
    )

    test('[REL-001] consumer verification never rebuilds or mutates the release tarball', async () => {
        const after = createHash('sha256')
            .update(await readFile(packed.tarball))
            .digest('hex')
        expect(after).toBe(digest)
    })
})
