const troubleshooting =
    'https://github.com/liria24/nuxt-files-sdk/blob/main/docs/content/4.reference/4.troubleshooting.md'

export interface FilesDevtoolsDiagnostic {
    code: FilesDevtoolsDiagnosticCode
    level: 'info' | 'warning' | 'error'
    message: string
    hint?: string
    docs?: string
}

export const FILES_DEVTOOLS_DIAGNOSTICS = {
    NUXT_FILES_NOT_CONFIGURED: {
        level: 'warning',
        message: 'The Files registry has not been configured.',
        hint: 'Check that files.config.ts is loaded by the Nuxt or Nitro integration.',
        docs: troubleshooting,
    },
    NUXT_FILES_INVALID_CONFIG: {
        level: 'error',
        message: 'The Files registry rejected the storage configuration.',
        hint: 'Check the storage and devStorage shapes in files.config.ts.',
        docs: troubleshooting,
    },
    NUXT_FILES_ADAPTER_INIT_FAILED: {
        level: 'error',
        message: 'A configured storage adapter could not be initialized.',
        hint: 'Check the provider package, runtime support, and required configuration.',
        docs: troubleshooting,
    },
    NUXT_FILES_GATEWAY_FAILED: {
        level: 'error',
        message: 'The Files DevTools gateway could not complete a request.',
        hint: 'Check the Nitro development server and the Files registry diagnostics.',
        docs: troubleshooting,
    },
} as const satisfies Record<string, Omit<FilesDevtoolsDiagnostic, 'code'>>

export type FilesDevtoolsDiagnosticCode = keyof typeof FILES_DEVTOOLS_DIAGNOSTICS

export const createFilesDevtoolsDiagnostic = (
    code: FilesDevtoolsDiagnosticCode,
    message?: string,
): FilesDevtoolsDiagnostic => ({ code, ...FILES_DEVTOOLS_DIAGNOSTICS[code], ...(message ? { message } : {}) })

export const isFilesDevtoolsDiagnostic = (value: unknown): value is FilesDevtoolsDiagnostic =>
    Boolean(
        value &&
        typeof value === 'object' &&
        'code' in value &&
        typeof value.code === 'string' &&
        Object.hasOwn(FILES_DEVTOOLS_DIAGNOSTICS, value.code) &&
        'level' in value &&
        (value.level === 'info' || value.level === 'warning' || value.level === 'error') &&
        'message' in value &&
        typeof value.message === 'string',
    )

export type FilesDevtoolsFailureKind = 'upload' | 'delete' | 'initialization' | 'gateway'

export interface FilesDevtoolsFailure {
    kind: FilesDevtoolsFailureKind
    message: string
    target?: string
}

export const isFilesDevtoolsFailure = (value: unknown): value is FilesDevtoolsFailure =>
    Boolean(
        value &&
        typeof value === 'object' &&
        'kind' in value &&
        (value.kind === 'upload' ||
            value.kind === 'delete' ||
            value.kind === 'initialization' ||
            value.kind === 'gateway') &&
        'message' in value &&
        typeof value.message === 'string' &&
        (!('target' in value) || value.target === undefined || typeof value.target === 'string'),
    )
