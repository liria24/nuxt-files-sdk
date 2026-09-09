import type { FilesHooks, FilesPlugin, ProviderSlug } from 'files-sdk'

interface ProviderFactories {
    akamai: typeof import('files-sdk/akamai').akamai
    alibaba: typeof import('files-sdk/alibaba').alibaba
    appwrite: typeof import('files-sdk/appwrite').appwrite
    archil: typeof import('files-sdk/archil').archil
    azure: typeof import('files-sdk/azure').azure
    'backblaze-b2': typeof import('files-sdk/backblaze-b2').backblazeB2
    box: typeof import('files-sdk/box').box
    'bun-s3': typeof import('files-sdk/bun-s3').bunS3
    'bunny-storage': typeof import('files-sdk/bunny-storage').bunnyStorage
    cloudinary: typeof import('files-sdk/cloudinary').cloudinaryAdapter
    convex: typeof import('files-sdk/convex').convex
    'digitalocean-spaces': typeof import('files-sdk/digitalocean-spaces').digitaloceanSpaces
    dropbox: typeof import('files-sdk/dropbox').dropbox
    exoscale: typeof import('files-sdk/exoscale').exoscale
    filebase: typeof import('files-sdk/filebase').filebase
    'firebase-storage': typeof import('files-sdk/firebase-storage').firebaseStorage
    fs: typeof import('files-sdk/fs').fs
    ftp: typeof import('files-sdk/ftp').ftp
    gcs: typeof import('files-sdk/gcs').gcs
    'google-drive': typeof import('files-sdk/google-drive').googleDrive
    hetzner: typeof import('files-sdk/hetzner').hetzner
    'ibm-cos': typeof import('files-sdk/ibm-cos').ibmCos
    'idrive-e2': typeof import('files-sdk/idrive-e2').idriveE2
    memory: typeof import('files-sdk/memory').memory
    minio: typeof import('files-sdk/minio').minio
    neon: typeof import('files-sdk/neon').neon
    'netlify-blobs': typeof import('files-sdk/netlify-blobs').netlifyBlobs
    onedrive: typeof import('files-sdk/onedrive').onedrive
    'oracle-cloud': typeof import('files-sdk/oracle-cloud').oracleCloud
    ovhcloud: typeof import('files-sdk/ovhcloud').ovhcloud
    pocketbase: typeof import('files-sdk/pocketbase').pocketbase
    r2: typeof import('files-sdk/r2').r2
    s3: typeof import('files-sdk/s3').s3
    's3-fetch': typeof import('files-sdk/s3-fetch').s3Fetch
    scaleway: typeof import('files-sdk/scaleway').scaleway
    sftp: typeof import('files-sdk/sftp').sftp
    sharepoint: typeof import('files-sdk/sharepoint').sharepoint
    storj: typeof import('files-sdk/storj').storj
    supabase: typeof import('files-sdk/supabase').supabase
    tencent: typeof import('files-sdk/tencent').tencent
    tigris: typeof import('files-sdk/tigris').tigris
    uploadthing: typeof import('files-sdk/uploadthing').uploadthing
    'vercel-blob': typeof import('files-sdk/vercel-blob').vercelBlob
    vultr: typeof import('files-sdk/vultr').vultr
    wasabi: typeof import('files-sdk/wasabi').wasabi
    webdav: typeof import('files-sdk/webdav').webdav
    yandex: typeof import('files-sdk/yandex').yandex
}

type ProviderOptions<Provider extends ProviderSlug> = Parameters<ProviderFactories[Provider]>[0]
type ConfigValue<Provider extends ProviderSlug> = Exclude<ProviderOptions<Provider>, undefined>
type ConfigInput<Provider extends ProviderSlug> = ConfigValue<Provider> | (() => ConfigValue<Provider>)
type ProviderConfig<Provider extends ProviderSlug> = {
    /** Native provider factory options, or a synchronous runtime resolver for them. */
    config?: ConfigInput<Provider>
} & (undefined extends ProviderOptions<Provider> ? unknown : { config: ConfigInput<Provider> })

/** Configuration for one Files SDK storage. */
export type StorageConfig<
    Provider extends ProviderSlug = ProviderSlug,
    Plugins extends readonly FilesPlugin[] = readonly FilesPlugin[],
> = Provider extends ProviderSlug
    ? {
          /** Files SDK provider slug, for example `r2`, `s3`, or `fs`. */
          adapter: Provider
          /** Native Files SDK plugins applied in array order. */
          plugins?: Plugins
          /** Native Files SDK lifecycle hooks. */
          hooks?: FilesHooks
          /** Scope every operation under this key prefix. */
          prefix?: string
          /** Retry provider failures up to this many times. */
          retries?: number
          /** Per-attempt timeout in milliseconds. */
          timeout?: number
      } & ProviderConfig<Provider>
    : never

/** Development-only provider settings for a storage. */
export type DevStorageConfig<Provider extends ProviderSlug = ProviderSlug> = Provider extends ProviderSlug
    ? { adapter: Provider } & ProviderConfig<Provider>
    : never

/** One unnamed storage, available through `useServerFiles()`. */
export interface SingleFilesConfig<Storage extends StorageConfig = StorageConfig> {
    /** Files SDK storage configuration. */
    storage: Storage
    /** Development-only provider settings. */
    devStorage?: DevStorageConfig
}

/** Named storages, each requiring its name when accessed. */
export interface NamedFilesConfig<Storages extends Record<string, StorageConfig> = Record<string, StorageConfig>> {
    /** Files SDK storage configuration. */
    storage: Storages
    /** Development-only provider settings keyed by storage name. */
    devStorage?: Partial<{ [Name in keyof Storages]: DevStorageConfig }>
}

/** Files SDK configuration used by the Nuxt/Nitro integration. */
export type FilesConfig = SingleFilesConfig | NamedFilesConfig

/** Define one unnamed Files SDK storage while preserving its provider and plugin types. */
export function defineFilesConfig<const Storage extends StorageConfig>(
    config: SingleFilesConfig<Storage>,
): SingleFilesConfig<Storage>
/** Define named Files SDK storages while preserving their names, providers, and plugin types. */
export function defineFilesConfig<const Storages extends Record<string, StorageConfig>>(
    config: NamedFilesConfig<Storages>,
): NamedFilesConfig<Storages>
export function defineFilesConfig(config: FilesConfig): FilesConfig {
    return config
}
