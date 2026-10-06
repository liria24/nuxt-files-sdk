/** Resolve on the server only. Never serialize the resolved value during generation. */
export const resolveGatewaySecret = async (
    routeSecret: string | undefined,
    environmentSecret: string | undefined,
    derive?: () => Promise<string>,
): Promise<string> => {
    if (routeSecret) return routeSecret
    if (environmentSecret) return environmentSecret
    if (derive) return derive()
    throw new Error('[nuxt-files-sdk:gateway-secret] Standalone Nitro requires route.secret or FILES_API_SECRET.')
}
