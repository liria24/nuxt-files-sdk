import { expect, test } from 'vitest'

import {
    filesBuilderCapabilities,
    requireFilesGateway,
} from '../../packages/nuxt-files-sdk/src/integration/capabilities'

test('[BUILDER-001] basic runtime, Gateway, DevTools and Nitro hooks have independent builder capabilities', () => {
    for (const api of ['nitro2', 'nitro3'] as const) {
        expect(filesBuilderCapabilities(api)).toEqual({
            runtime: true,
            gateway: true,
            devtools: true,
            nitroHooks: true,
            experimental: false,
        })
    }
    for (const api of ['nuxt', undefined] as const) {
        const capabilities = filesBuilderCapabilities(api)
        expect(capabilities.runtime).toBe(true)
        expect(capabilities.devtools).toBe(false)
        expect(capabilities.nitroHooks).toBe(false)
        expect(() => requireFilesGateway(true, capabilities.gateway)).toThrow('[nuxt-files-sdk:gateway-unavailable]')
        expect(() => requireFilesGateway(false, capabilities.gateway)).not.toThrow()
    }
})
