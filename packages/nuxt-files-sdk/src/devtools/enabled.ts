export interface FilesDevtoolsOptions {
    /** Enable Files SDK development tools when Nuxt DevTools is available. */
    enabled?: boolean
    /** Allow uploads and deletes from the development-only file browser. */
    write?: boolean
}

export type FilesDevtoolsSetting = boolean | FilesDevtoolsOptions

export const shouldEnableFilesDevtools = (
    development: boolean,
    moduleDevtools: FilesDevtoolsSetting,
    nuxtDevtools?: boolean | { enabled?: boolean },
): boolean =>
    development &&
    (typeof moduleDevtools === 'boolean' ? moduleDevtools : moduleDevtools.enabled !== false) &&
    (typeof nuxtDevtools === 'boolean' ? nuxtDevtools : nuxtDevtools?.enabled !== false)

export const filesDevtoolsWriteEnabled = (setting: FilesDevtoolsSetting): boolean =>
    typeof setting === 'object' && setting.write === true
