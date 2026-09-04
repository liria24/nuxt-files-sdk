import { performance } from 'node:perf_hooks'

import { FilesRegistry } from '../src/runtime/registry'

const registry = new FilesRegistry({
    storage: { blob: { adapter: 'fs', root: '.data/benchmark' } },
})
const start = performance.now()
await registry.get('blob')
const initialized = performance.now()
for (let index = 0; index < 10_000; index++) void registry.get('blob')
const memoized = performance.now()
// oxlint-disable-next-line no-console -- benchmark output is its result
console.log(JSON.stringify({ initialMs: initialized - start, memoized10kMs: memoized - initialized }))
