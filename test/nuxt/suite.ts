import { fileURLToPath } from 'node:url'

import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, test } from 'vitest'

import { cleanFixture, installFixture } from '../utils/fixture'

export const nuxtRuntimeSuite = async (name: string, expected: Record<string, unknown>): Promise<void> => {
    await cleanFixture(name)
    await installFixture(name)

    describe(`Nuxt ${name === 'nuxt4' ? '4' : '5 nightly'}`, async () => {
        await setup({
            rootDir: fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)),
            browser: false,
        })

        test('[CFG-001][NUXT-001] loads the module, root config, Nitro plugin, and configured storage', async () => {
            await expect($fetch('/api/files')).resolves.toEqual(expected)
        })
    })
}
