import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

import {
    buildPackage,
    cleanFixture,
    directorySize,
    fixtureDirectory,
    installFixture,
    outputPaths,
    packPackage,
    repositoryRoot,
    runCommand,
    startFixtureServer,
} from './utils/fixture'

// Report timings, never use machine-dependent elapsed time as a correctness gate.
const elapsed = async (run: () => Promise<unknown>) => {
    const start = performance.now()
    await run()
    return Math.round(performance.now() - start)
}
await buildPackage()
const samples: number[] = []
for (let sample = 0; sample < 7; sample++) {
    samples.push(
        Number(
            await runCommand('node', [
                '--input-type=module',
                '-e',
                "const start = performance.now(); await import('./packages/nuxt-files-sdk/dist/module.js'); console.log(performance.now() - start)",
            ]),
        ),
    )
}
const sdk = JSON.parse(await readFile(resolve(repositoryRoot, 'node_modules/files-sdk/package.json'), 'utf8')) as {
    version: string
}
const fixtures: Record<string, unknown> = {}
for (const name of ['nuxt4', 'nitro-v2']) {
    await cleanFixture(name)
    await installFixture(name)
    const cwd = fixtureDirectory(name)
    const timings: Record<string, number> = {}
    for (const script of ['prepare', 'typecheck', 'build']) {
        timings[`${script}Ms`] = await elapsed(() => runCommand('bun', ['run', script], { cwd }))
    }
    const outputBytes = await directorySize(resolve(cwd, '.output'))
    const generatedBytes = await directorySize(
        resolve(cwd, name === 'nuxt4' ? '.nuxt/nuxt-files-sdk' : '.nitro/nuxt-files-sdk'),
    )
    if (name === 'nuxt4') {
        const start = performance.now()
        const server = await startFixtureServer(name, { development: true, readyPath: '/api/files' })
        try {
            timings.devReadyMs = Math.round(performance.now() - start)
        } finally {
            await server.close()
        }
    }
    fixtures[name] = {
        ...timings,
        outputBytes,
        generatedBytes,
        installedBytes: await directorySize(resolve(cwd, 'node_modules')),
        packageManifests: (await outputPaths(resolve(cwd, 'node_modules'))).filter((path) =>
            path.endsWith('/package.json'),
        ).length,
    }
}
const packed = await packPackage()
let tarballBytes: number
try {
    tarballBytes = (await stat(packed.tarball)).size
} finally {
    await rm(packed.directory, { recursive: true, force: true })
}
const report = {
    node: (await runCommand('node', ['--version'])).trim(),
    bun: (await runCommand('bun', ['--version'])).trim(),
    platform: process.platform,
    sdk: sdk.version,
    commit: (await runCommand('git', ['rev-parse', 'HEAD'])).trim(),
    moduleImportMedianMs: samples.toSorted((a, b) => a - b)[3],
    distBytes: await directorySize(resolve(repositoryRoot, 'packages/nuxt-files-sdk/dist')),
    tarballBytes,
    fixtures,
}
const json = `${JSON.stringify(report, null, 2)}\n`
const output = process.argv[2]
if (output) await writeFile(resolve(output), json)
// oxlint-disable-next-line no-console -- The benchmark report is the command's output.
console.log(json)
