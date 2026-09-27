import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

import { fixtureDirectory, readOutput, unusedPlugins } from '../utils/fixture'
import { nitroSuite } from './suite'

nitroSuite('nitro-v3', 'nitro/types', { adapter: 'fs', namedAdapter: 'fs', versions: 0 })

test('custom adapter and plugin resolver bundle only their imported dependencies', async () => {
    const directory = fixtureDirectory('nitro-v3')
    const plugin = await readFile(resolve(directory, 'node_modules/.nitro/nuxt-files-sdk/plugin.mjs'), 'utf8')
    const output = await readOutput(resolve(directory, '.output/server'))
    expect(plugin).toContain('from "files-sdk/fs"')
    expect(plugin).not.toContain('from "files-sdk/memory"')
    expect(output).not.toMatch(/node_modules\/(?:@aws-sdk|@azure|@google-cloud)\//u)
    for (const unused of unusedPlugins)
        expect(output, unused).not.toMatch(new RegExp(`name:\\s*["']${unused}["']`, 'u'))
})
