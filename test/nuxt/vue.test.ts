import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

import { fixtureDirectory, readOutput, runFixture } from '../utils/fixture'

test('[NUXT-002][UI-001][UI-002] Nuxt Vue > composables and all Files UI components typecheck and build', async () => {
    await expect(runFixture('nuxt4-vue')).resolves.toBeUndefined()
    const output = await readOutput(resolve(fixtureDirectory('nuxt4-vue'), '.output/public'))
    expect(output).toContain('min-height:calc(var(--spacing')
    expect(output).toContain('drag-active=true')
    expect(output).toContain('ring-secondary')
    const registry = await readFile(resolve(fixtureDirectory('nuxt4-vue'), '.nuxt/ui/index.ts'), 'utf8')
    expect(registry).toContain('export const filesDropzone')
    expect(registry).toContain('min-h-40')
    expect(registry).toContain('compoundVariants')
    expect(registry).toContain('defaultVariants')
})

test('[UI-001] Nuxt Vue > UI works without Nuxt UI or extra UI dependencies', async () => {
    await expect(runFixture('nuxt4-vue-standalone')).resolves.toBeUndefined()
    const output = await readOutput(resolve(fixtureDirectory('nuxt4-vue-standalone'), '.output/public'))
    expect(output).toContain('min-height:calc(var(--spacing')
    expect(output).toContain('drag-active=true')
})
