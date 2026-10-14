import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test'

import { invalidTypeCases } from '../types/invalid/cases'
import { installConsumer, packageManager, runConsumerScript } from '../utils/consumer-install'
import { consumerSessionBudget, withConsumerSession } from '../utils/consumer-session'
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
    checkInvalidType,
    checkPublicExamples,
    cleanTypeContracts,
} from '../utils/generated-types'

let packed: Awaited<ReturnType<typeof packPackage>>
let digest: string
const secret = 'NUXT_FILES_TEST_SECRET_123456'
const smoke = process.env.NUXT_FILES_CONSUMER_SMOKE === '1'
const consumerFixtures =
    packageManager === 'pnpm'
        ? ['workspace']
        : packageManager === 'bun' && !smoke
          ? ['nuxt4', 'nitro-v2', 'nitro-v3']
          : ['nuxt4']
describe('Packed consumer', () => {
    beforeAll(async () => {
        process.env.NUXT_AWS_SECRET_ACCESS_KEY = secret
        packed = await packPackage()
        digest = createHash('sha256')
            .update(await readFile(packed.tarball))
            .digest('hex')
    })
    afterAll(async () => {
        delete process.env.NUXT_AWS_SECRET_ACCESS_KEY
        if (packed) await rm(packed.directory, { recursive: true, force: true })
    })
    test.for(consumerFixtures)(
        '[PKG-004][RESOLVE-002] %s installs the exact tarball and passes public contracts',
        { timeout: consumerSessionBudget },
        async (layout, context) =>
            withConsumerSession(
                context,
                `${packageManager}:${layout}`,
                async ({ signal, stage, startVerification }) => {
                    const name = layout === 'workspace' ? 'nuxt4' : layout
                    const parent = layout === 'workspace' ? resolve(packed.directory, 'workspace') : packed.directory
                    const consumer = await stage('copy consumer', () =>
                        copyPackedConsumer(name, parent, packed.tarball),
                    )
                    const consumerPackage = JSON.parse(await readFile(resolve(consumer, 'package.json'), 'utf8')) as {
                        dependencies: Record<string, string>
                        devDependencies: Record<string, string>
                    }
                    expect(consumerPackage.dependencies['files-sdk']).toBeUndefined()
                    if (layout === 'workspace') {
                        await writeFile(resolve(consumer, '.npmrc'), 'hoist=false\nshamefully-hoist=false\n')
                        // Strict non-hoisting also exposes Nuxt's undeclared c12/unplugin imports.
                        // Keep these framework dependencies explicit, including for workspace Layers.
                        const frameworkDependencies = Object.fromEntries(
                            ['c12', 'unplugin', '@types/node'].map((dependency) => [
                                dependency,
                                consumerPackage.devDependencies[dependency]!,
                            ]),
                        )
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
                    startVerification()
                    const installed = JSON.parse(
                        await stage('owned SDK resolution', () =>
                            runCommand(
                                'node',
                                [
                                    '--input-type=module',
                                    '-e',
                                    `import { createRequire } from 'node:module'; import { readFileSync } from 'node:fs'; import { pathToFileURL } from 'node:url';
                                    const packageUrl = import.meta.resolve('nuxt-files-sdk/package.json');
                                    const manifest = JSON.parse(readFileSync(new URL(packageUrl), 'utf8'));
                                    const { satisfies } = await import(pathToFileURL(createRequire(packageUrl).resolve('verkit')));
                                    const { resolveOwnedSdk } = await import(new URL('./dist/integration/resolve.js', packageUrl)); const sdk = resolveOwnedSdk(); console.log(JSON.stringify({ path: sdk.manifestPath, version: sdk.manifest.version, range: manifest.dependencies['files-sdk'], compatible: satisfies(sdk.manifest.version, manifest.dependencies['files-sdk']), bare: ${layout === 'workspace' ? 'resolveOwnedSdk(import.meta.url).manifest.version' : 'null'} }))`,
                                ],
                                { cwd: consumer, signal },
                            ),
                        ),
                    ) as { path: string; version: string; compatible: boolean; bare: string | null }
                    expect(installed.compatible, JSON.stringify(installed)).toBe(true)
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
                    if (name === 'nuxt4' && !smoke) {
                        await stage('native generated declarations', () => checkGeneratedTypes(consumer, { signal }))
                        for (const entry of invalidTypeCases)
                            await stage(`negative ${entry.id}`, () => checkInvalidType(consumer, entry, { signal }))
                        await stage('public examples', () => checkPublicExamples(consumer, { signal }))
                        await stage('type contract cleanup', () => cleanTypeContracts(consumer))
                    }
                    if (!smoke) {
                        const paths = await stage('output paths', () => outputPaths(resolve(consumer, '.output')))
                        const output = await stage('output scan', () => readOutput(resolve(consumer, '.output')))
                        const runtime = await stage('runtime scan', () =>
                            readOutput(resolve(consumer, '.output'), true),
                        )
                        assert(!runtime.includes('#files-sdk'))
                        assert(!runtime.includes(consumer.replaceAll('\\', '/')))
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
                        assert(!(output + generated).includes(secret), `${name} secret leakage`)
                        assert.deepEqual(
                            paths.filter((path) => /node_modules\/(?:@aws-sdk|@azure|@google-cloud)\//u.test(path)),
                            [],
                        )
                        assert.match(runtime, /name:\s*["'\x60]versioning["'\x60]/u)
                        for (const plugin of unusedPlugins) {
                            assert.doesNotMatch(
                                runtime,
                                new RegExp(`name:\\s*["'\\x60]${plugin}["'\\x60]`, 'u'),
                                `${name}: ${plugin}`,
                            )
                            assert.deepEqual(
                                paths.filter((path) => path.includes(`files-sdk/dist/${plugin}/`)),
                                [],
                            )
                        }
                        for (const forbidden of [
                            'files-sdk/vue',
                            'devframe',
                            '@nuxt/devtools',
                            ...(name === 'nuxt4' ? [] : ['@nuxt/kit']),
                        ]) {
                            assert(!runtime.includes(forbidden), `${name}: ${forbidden}`)
                        }
                        assert.deepEqual(
                            paths.filter((path) => /node_modules\/(?:@nuxt\/(?:kit|devtools)|devframe)\//u.test(path)),
                            [],
                        )
                        const dependencies = await stage('installed package paths', () =>
                            outputPaths(resolve(consumer, 'node_modules')),
                        )
                        assert.equal(
                            dependencies.some((path) => /(?:^|\/)nuxt\/package.json$/u.test(path)),
                            name === 'nuxt4',
                        )
                    }
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
                },
            ),
    )

    test('[REL-001] consumer verification never rebuilds or mutates the release tarball', async () => {
        const after = createHash('sha256')
            .update(await readFile(packed.tarball))
            .digest('hex')
        expect(after).toBe(digest)
    })
})
