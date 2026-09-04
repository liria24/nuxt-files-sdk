declare module 'nitropack/types' {
    interface NitroRuntimeHooks {
        'files:action': (payload: { event: unknown; storage: string }) => void | Promise<void>
        'files:error': (payload: { event: unknown; storage: string }) => void | Promise<void>
        'files:retry': (payload: { event: unknown; storage: string }) => void | Promise<void>
    }
}

export type NuxtFilesRuntimeHooks = import('nitropack/types').NitroRuntimeHooks
