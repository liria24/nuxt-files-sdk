/** Public API selection is evidence of an adapter, not a promise of arbitrary builder features. */
export const filesBuilderCapabilities = (api: 'nuxt' | 'nitro2' | 'nitro3' | undefined) => {
    const nitro = api === 'nitro2' || api === 'nitro3'
    return { runtime: true, gateway: nitro, devtools: nitro, nitroHooks: nitro, experimental: !nitro }
}

export const requireFilesGateway = (enabled: boolean, available: boolean): void => {
    if (enabled && !available) {
        throw new Error(
            '[nuxt-files-sdk:gateway-unavailable] The selected server builder cannot mount Files Gateway routes.',
        )
    }
}
