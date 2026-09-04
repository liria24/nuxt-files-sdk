import type { FilesPlugin } from 'files-sdk'
import type { LoadFilesOptions } from 'files-sdk/loader'

export type StorageConfig<Plugins extends readonly FilesPlugin[] = readonly FilesPlugin[]> = Omit<
    LoadFilesOptions,
    'provider'
> & {
    /** Files SDK provider subpath, for example `r2`, `s3`, or `fs`. */
    adapter: string
    /** Native Files SDK plugins, applied in array order. */
    plugins?: Plugins
}

export interface FilesConfig<
    Storage extends Record<string, StorageConfig> = Record<string, StorageConfig>,
> {
    /** Storage used when useServerFiles() is called without a name. */
    default?: keyof Storage & string
    /** Explicit development overrides. These never act as failure fallbacks. */
    devStorage?: Partial<{ [Name in keyof Storage]: StorageConfig }>
    storage: Storage
}

/** Preserve storage names and plugin tuples for generated/project types. */
export const defineFilesConfig = <const Config extends FilesConfig>(config: Config): Config =>
    config
