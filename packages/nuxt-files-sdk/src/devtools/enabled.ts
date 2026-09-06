export const shouldEnableFilesDevtools = (
    development: boolean,
    moduleEnabled: boolean,
    nuxtDevtools: boolean | { enabled: boolean },
): boolean => development && moduleEnabled && (typeof nuxtDevtools === 'boolean' ? nuxtDevtools : nuxtDevtools.enabled)
