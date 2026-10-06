import { expect, test, vi } from 'vitest'

import { resolveGatewaySecret } from '../../packages/nuxt-files-sdk/src/runtime/gateway-secret'

test('[SECRET-001] runtime Gateway secret precedence is route, environment, then purpose derivation', async () => {
    const derive = vi.fn<() => Promise<string>>().mockResolvedValue('derived')
    expect(await resolveGatewaySecret('route', 'environment', derive)).toBe('route')
    expect(await resolveGatewaySecret(undefined, 'environment', derive)).toBe('environment')
    expect(derive).not.toHaveBeenCalled()
    expect(await resolveGatewaySecret(undefined, undefined, derive)).toBe('derived')
    expect(derive).toHaveBeenCalledTimes(1)
    await expect(resolveGatewaySecret(undefined, undefined)).rejects.toThrow('Standalone Nitro requires')
    const error = new Error('root secret unavailable')
    derive.mockRejectedValueOnce(error).mockResolvedValueOnce('recovered')
    await expect(resolveGatewaySecret(undefined, undefined, derive)).rejects.toBe(error)
    expect(await resolveGatewaySecret(undefined, undefined, derive)).toBe('recovered')
})
