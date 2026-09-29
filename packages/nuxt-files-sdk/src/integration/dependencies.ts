import type { StorageEntry } from '../runtime/normalize'

const aws = ['@aws-sdk/client-s3', '@aws-sdk/s3-presigned-post', '@aws-sdk/s3-request-presigner']
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
export const storageDependencies = (
    entry: StorageEntry,
    target: FilesTarget,
    imports: readonly DependencyRequirement[],
): DependencyRequirement[] => {
    const adapter = entry.storage.adapter
    if (typeof adapter !== 'string') return []
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
    const result = imports.map((entryImport) => ({
        ...entryImport,
        ...(entry.name === undefined ? {} : { storage: entry.name }),
    }))
    let usesAws: boolean | undefined = imports.some(({ dependency }) => dependency === '@aws-sdk/client-s3')
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
