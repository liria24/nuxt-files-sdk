import { performance } from 'node:perf_hooks'

import { memory } from 'files-sdk/memory'

import type { StorageConfig } from '../packages/nuxt-files-sdk/src/config'
import { FilesRegistry } from '../packages/nuxt-files-sdk/src/runtime/registry'

for (const count of [1, 100, 1000]) {
    const samples = []
    for (let sample = 0; sample < 7; sample++) {
        const storage: Record<string, StorageConfig> = Object.fromEntries(
            Array.from({ length: count }, (_, index) => [`storage${index}`, { adapter: 'memory' }]),
        )
        const registry = new FilesRegistry({ storage }, { factories: { memory } })
        registry.get('storage0')
        for (let index = 0; index < 10_000; index++) registry.get('storage0')
        const start = performance.now()
        for (let index = 0; index < 10_000; index++) registry.get('storage0')
        samples.push(performance.now() - start)
    }
    // oxlint-disable-next-line no-console -- benchmark output is its result
    console.log({ storages: count, memoized10kMedianMs: samples.toSorted((a, b) => a - b)[3] })
}
