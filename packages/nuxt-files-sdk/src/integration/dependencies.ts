import type { ProviderSlug } from 'files-sdk'

import type { StorageEntry } from '../runtime/normalize'

const aws = ['@aws-sdk/client-s3', '@aws-sdk/s3-presigned-post', '@aws-sdk/s3-request-presigner']
const graph = [
    '@azure/identity',
    '@microsoft/microsoft-graph-client',
    '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js',
]

/** Runtime imports in the owned SDK, not provider metadata's broader type/authoring peers. */
export const adapterImports = {
    akamai: aws,
    alibaba: aws,
    appwrite: ['node-appwrite', 'node-appwrite/file'],
    archil: aws,
    azure: ['@azure/storage-blob'],
    'backblaze-b2': aws,
    box: ['box-typescript-sdk-gen'],
    'bun-s3': [],
    'bunny-storage': ['@bunny.net/storage-sdk'],
    cloudinary: ['cloudinary'],
    convex: [],
    'digitalocean-spaces': aws,
    dropbox: ['dropbox'],
    exoscale: aws,
    filebase: aws,
    'firebase-storage': [],
    fs: [],
    ftp: ['basic-ftp'],
    gcs: ['@google-cloud/storage'],
    'google-drive': ['@googleapis/drive', 'google-auth-library'],
    hetzner: aws,
    'ibm-cos': aws,
    'idrive-e2': aws,
    memory: [],
    minio: [],
    neon: aws,
    'netlify-blobs': ['@netlify/blobs'],
    onedrive: graph,
    'oracle-cloud': aws,
    ovhcloud: aws,
    pocketbase: ['pocketbase'],
    r2: [],
    rustfs: [],
    s3: aws,
    's3-fetch': [],
    scaleway: aws,
    sftp: ['ssh2-sftp-client'],
    sharepoint: graph,
    storj: aws,
    supabase: ['@supabase/storage-js'],
    tencent: aws,
    tigris: aws,
    uploadthing: ['uploadthing/server'],
    'vercel-blob': ['@vercel/blob'],
    vultr: aws,
    wasabi: aws,
    webdav: ['webdav'],
    yandex: aws,
} satisfies Record<ProviderSlug, readonly string[]>

export interface DependencyRequirement {
    storage?: string
    subpath: string
    dependency: string
    necessity: 'required' | 'conditional' | 'unknown'
    stage: 'import' | 'construction' | 'operation'
    reason: string
    conditions?: string[]
}

export type FilesTarget = 'node' | 'workerd' | 'bun' | 'unknown'
const unknownValue = Symbol('runtime value')
const field = (object: unknown, key: string): unknown => {
    if (typeof object === 'function') return unknownValue
    if (!object || typeof object !== 'object') return undefined
    for (let current: object | null = object; current; current = Object.getPrototypeOf(current)) {
        const descriptor = Object.getOwnPropertyDescriptor(current, key)
        if (descriptor) return 'value' in descriptor ? descriptor.value : unknownValue
    }
    return undefined
}

/** Pure structural analysis: never calls config resolvers, clients, factories or credentials. */
export const storageDependencies = (entry: StorageEntry, target: FilesTarget): DependencyRequirement[] => {
    const adapter = entry.storage.adapter
    if (typeof adapter !== 'string') return []
    if (!Object.hasOwn(adapterImports, adapter))
        throw new Error(`[nuxt-files-sdk:adapter-dependencies] Unreviewed adapter: ${adapter}`)
    const subpath = `files-sdk/${adapter}`
    const requirement = (
        dependency: string,
        necessity: DependencyRequirement['necessity'],
        stage: DependencyRequirement['stage'],
        reason: string,
    ): DependencyRequirement => ({
        ...(entry.name === undefined ? {} : { storage: entry.name }),
        subpath,
        dependency,
        necessity,
        stage,
        reason,
    })
    const result = adapterImports[adapter].map((dependency) =>
        requirement(dependency, 'required', 'import', 'Static adapter import'),
    )
    let usesAws: boolean | undefined = adapterImports[adapter] === aws
    if (adapter === 'r2' || adapter === 'minio' || adapter === 'rustfs') {
        const binding = adapter === 'r2' ? field(entry.storage.config, 'binding') : undefined
        const client = field(entry.storage.config, 'client')
        usesAws =
            binding === unknownValue || client === unknownValue
                ? undefined
                : binding || client === 'fetch'
                  ? false
                  : client === 'aws-sdk'
                    ? true
                    : target === 'node' || target === 'bun'
                      ? true
                      : undefined
        // workerd's default also depends on DOMParser; a preset alone cannot establish that global.
        if (usesAws !== false)
            result.push(
                ...aws.map((dependency) =>
                    requirement(
                        dependency,
                        usesAws ? 'required' : 'unknown',
                        'operation',
                        'AWS engine selected at runtime unless client is explicit',
                    ),
                ),
            )
    }
    if (usesAws !== false)
        result.push(
            requirement(
                '@aws-sdk/lib-storage',
                usesAws ? 'conditional' : 'unknown',
                'operation',
                'Multipart, progress or unknown-length uploads only',
            ),
        )
    if (adapter === 'firebase-storage') {
        const app = field(entry.storage.config, 'app')
        const file = field(app, 'file')
        const getFiles = field(app, 'getFiles')
        const injectedBucket = typeof file === 'function' && typeof getFiles === 'function'
        const unknown = app === unknownValue || file === unknownValue || getFiles === unknownValue
        if (!injectedBucket) {
            if (!app || unknown)
                result.push({
                    ...requirement(
                        'firebase-admin/app',
                        unknown ? 'unknown' : 'required',
                        'construction',
                        'Create the Firebase app',
                    ),
                    conditions: ['node', 'require'],
                })
            result.push({
                ...requirement(
                    'firebase-admin/storage',
                    unknown ? 'unknown' : 'required',
                    'construction',
                    'Resolve a bucket from the Firebase app',
                ),
                conditions: ['node', 'require'],
            })
        }
    }
    return result
}

export const deploymentTarget = (preset?: string): FilesTarget => {
    if (preset?.startsWith('cloudflare')) return 'workerd'
    if (preset === 'bun') return 'bun'
    if (preset === 'node' || preset?.startsWith('node-')) return 'node'
    return 'unknown'
}
