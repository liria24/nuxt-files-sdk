import { describe, expect, test, vi } from 'vitest'

import { defineFilesConfig } from '../../packages/nuxt-files-sdk/src/config'
import { providerCode, selectedAdapters } from '../../packages/nuxt-files-sdk/src/integration/nitro'

describe('provider generation', () => {
    test('[CFG-009] selects only providers used in the active runtime mode without resolving credentials', () => {
        const runtimeConfig = vi.fn<() => { binding: never }>(() => ({ binding: undefined as never }))
        const config = defineFilesConfig({
            storage: {
                files: { adapter: 'r2', config: runtimeConfig },
                temporary: { adapter: 'memory' },
            },
            devStorage: {
                files: { adapter: 'fs', config: { root: '.data/files' } },
            },
        })

        expect(selectedAdapters(config, false)).toEqual({ adapters: ['memory', 'r2'], single: false })
        expect(selectedAdapters(config, true)).toEqual({ adapters: ['fs', 'memory'], single: false })
        expect(runtimeConfig).not.toHaveBeenCalled()

        const generated = providerCode(['r2'])
        expect(generated.imports).toBe('import { r2 as provider0 } from "files-sdk/r2"')
        expect(generated.factories).toBe('"r2": provider0')
    })
})
