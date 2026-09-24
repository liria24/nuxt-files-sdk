import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { afterAll, expect, test } from 'vitest'

import { cleanFixture, fixtureDirectory, installFixture, runCommand } from '../utils/fixture'

const directory = fixtureDirectory('nuxt4')
const generated = resolve(directory, '.nuxt/nuxt-files-sdk')
afterAll(() => cleanFixture('nuxt4'))

test('Nuxt --envName staging selects $env.staging before provider generation', async () => {
    await cleanFixture('nuxt4')
    await installFixture('nuxt4')
    await runCommand('bunx', ['nuxt', 'build', '--envName', 'staging'], { cwd: directory })
    const plugin = await readFile(resolve(generated, 'plugin.mjs'), 'utf8')
    const selected = await readFile(resolve(generated, 'selected.ts'), 'utf8')
    expect(plugin).toContain('files-sdk/memory')
    expect(selected).toContain('staging')
    expect(selected).not.toContain('NUXT_FILES_DEV_ONLY')
    expect(selected).not.toContain('production-archive')
})

test('Nuxt generate applies production then prerender', async () => {
    await cleanFixture('nuxt4')
    await runCommand('bunx', ['nuxt', 'generate'], { cwd: directory })
    const resolved = await readFile(resolve(generated, 'resolved.mjs'), 'utf8')
    const selected = await readFile(resolve(generated, 'selected.ts'), 'utf8')
    expect(resolved.indexOf('raw["$prerender"]')).toBeLessThan(resolved.indexOf('raw["$production"]'))
    expect(selected).toContain('production-archive')
    expect(selected).toContain('$prerender')
    expect(selected).not.toContain('NUXT_FILES_DEV_ONLY')
})
