import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import { fixtureDirectory, runFixture, startFixtureServer } from '../utils/fixture'

export const nitroSuite = (
    name: 'nitro-v2' | 'nitro-v3',
    hookModule: 'nitropack/types' | 'nitro/types',
    expected: Record<string, unknown>,
): void => {
    describe(`Nitro ${name === 'nitro-v2' ? 'v2' : 'v3'}`, () => {
        test('[NITRO-001][TYPE-006] prepares, typechecks, builds, and runs the standalone integration', async () => {
            await runFixture(name)
            const directory = fixtureDirectory(name)
            const plugin = await readFile(resolve(directory, '.nitro/nuxt-files-sdk/plugin.mjs'), 'utf8')
            const types = await readFile(resolve(directory, '.nitro/nuxt-files-sdk/storage-registry.d.ts'), 'utf8')

            expect(plugin).toContain("from 'nuxt-files-sdk/runtime'")
            expect(plugin).not.toContain("from 'nuxt-files-sdk'")
            expect(plugin).toContain('from "files-sdk/fs"')
            expect(plugin).not.toContain('files-sdk/loader')
            expect(types).toContain(`declare module "${hookModule}"`)
            expect(types).toContain("declare module 'nuxt-files-sdk/runtime'")
            expect(plugin).not.toMatch(/import config from "[A-Z]:\\\\/u)

            const server = await startFixtureServer(name)
            try {
                await expect(fetch(`${server.url}/files`).then((response) => response.json())).resolves.toEqual(
                    expected,
                )
            } finally {
                await server.close()
            }
        })
    })
}
