import { nitroSuite } from './suite'

nitroSuite('nitro-v3', 'nitro/types', { adapter: 'fs', namedAdapter: 'fs', versions: 0 })
