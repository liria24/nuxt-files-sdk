import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

import { fixtureDirectory } from '../utils/fixture'
import { nuxtRuntimeSuite } from './suite'

await nuxtRuntimeSuite('nuxt5-nightly', { adapter: 'fs', versions: 0 })

test('experimental target is an actual distributed Nuxt 5 package', async () => {
    const manifest = JSON.parse(
        await readFile(resolve(fixtureDirectory('nuxt5-nightly'), 'node_modules/nuxt/package.json'), 'utf8'),
    ) as { version: string }
    expect(manifest.version).toBe('5.0.0-2610051428-355ed95')
})
