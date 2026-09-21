import type { Files } from 'files-sdk'

import type { FilesConfig } from '../config'
import { FilesRegistry, type RegistryDiagnostic } from './registry'

let registry: FilesRegistry | undefined
let registryDiagnostic: RegistryDiagnostic | undefined

/** Configure the process-local Files registry used by {@link useServerFiles}. */
export const configureFiles = <const C extends FilesConfig>(
    config: C,
    options: ConstructorParameters<typeof FilesRegistry<C>>[1],
): FilesRegistry<C> => {
    try {
        const value = new FilesRegistry(config, options)
        registry = value
        registryDiagnostic = undefined
        return value
    } catch (error) {
        registry = undefined
        registryDiagnostic = { code: 'NUXT_FILES_INVALID_CONFIG' }
        throw error
    }
}

/** Return secret-free diagnostics for the configured process-local Files registry. */
export const inspectFiles = (): ReturnType<FilesRegistry['inspect']> =>
    registry?.inspect() ?? {
        storages: [],
        diagnostics: [registryDiagnostic ?? { code: 'NUXT_FILES_NOT_CONFIGURED' }],
    }

export const getFiles = (name?: string): Files => {
    if (!registry) throw new Error('[nuxt-files-sdk:not-configured] The Files registry has not been configured.')
    return name === undefined ? registry.get() : (registry.get as (storage: string) => Files)(name)
}
