import { readdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from 'vite-plus/test'

import { fixtureDirectory, installFixture, readOutput, runCommand } from '../utils/fixture'

test('[BUNDLE-009] Nuxt Cloudflare retains lazy unnamed R2 without optional AWS engines', async () => {
    await installFixture('nuxt4')
    const directory = resolve(fixtureDirectory('nuxt4'), 'cloudflare')
    for (const path of ['.nuxt', '.output', 'node_modules/.cache/nuxt']) {
        await rm(resolve(directory, path), { recursive: true, force: true })
    }
    for (const script of ['prepare', 'typecheck', 'build']) {
        await runCommand('bunx', ['nuxt', script], {
            cwd: directory,
            env: { NITRO_PRESET: 'cloudflare_module' },
        })
    }
    const generated = await readOutput(resolve(directory, 'node_modules/.cache/nuxt/.nuxt/nuxt-files-sdk'))
    expect(generated).toContain('from "#files-sdk/r2"')
    expect(generated).not.toContain('from "#files-sdk/fs"')
    const output = await readOutput(resolve(directory, '.output'))
    expect(output).not.toMatch(/node_modules\/@aws-sdk\//u)
    expect(await readdir(resolve(directory, '.output/server'))).toContain('index.mjs')
})
