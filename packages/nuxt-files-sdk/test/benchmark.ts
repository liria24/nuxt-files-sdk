import { performance } from 'node:perf_hooks'

import { fs } from 'files-sdk/fs'

import { FilesRegistry } from '../src/runtime/registry'

const registry = new FilesRegistry(
    { storage: { adapter: 'fs', config: { root: '.data/benchmark' } } },
    { factories: { fs } },
)
const start = performance.now()
registry.get()
const initialized = performance.now()
for (let index = 0; index < 10_000; index++) void registry.get()
const memoized = performance.now()
// oxlint-disable-next-line no-console -- benchmark output is its result
console.log(JSON.stringify({ initialMs: initialized - start, memoized10kMs: memoized - initialized }))
