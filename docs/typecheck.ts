import { createRequire } from 'node:module'

import { run } from 'vue-tsc'

const require = createRequire(import.meta.url)
// vue-tsc otherwise resolves the workspace's incompatible TypeScript 7 package.
run(require.resolve('typescript6/lib/tsc', { paths: [import.meta.dirname] }))
