import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

import { fixtureDirectory, runFixture } from '../utils/fixture'

test('Nuxt 5 nightly > generated types pass actual typecheck', async () => {
    await runFixture('nuxt5-nightly')
    const generated = await readFile(
        resolve(fixtureDirectory('nuxt5-nightly'), '.nuxt/nuxt-files-sdk/storage-registry.d.ts'),
        'utf8',
    )
    expect(generated).toContain("declare module 'nuxt-files-sdk/runtime'")
})
