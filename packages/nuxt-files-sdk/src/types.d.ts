import type { FilesActionEvent, FilesErrorEvent, FilesRetryEvent } from 'files-sdk'

interface FilesNitroHooks {
    'files:action': (payload: { event: FilesActionEvent; storage: string }) => void | Promise<void>
    'files:error': (payload: { event: FilesErrorEvent; storage: string }) => void | Promise<void>
    'files:retry': (payload: { event: FilesRetryEvent; storage: string }) => void | Promise<void>
}

declare module 'nitropack/types' {
    interface NitroRuntimeHooks {
        'files:action': FilesNitroHooks['files:action']
        'files:error': FilesNitroHooks['files:error']
        'files:retry': FilesNitroHooks['files:retry']
    }
}

declare module 'nitro/types' {
    interface NitroRuntimeHooks extends FilesNitroHooks {}
}

export type NuxtFilesRuntimeHooks = import('nitropack/types').NitroRuntimeHooks
