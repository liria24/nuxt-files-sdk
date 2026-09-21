import type { FilesConfig } from '../config'

// Preparation must retain both configurations regardless of the host's NODE_ENV.
// Runtime imports still use the public helper, which strips development settings in production.
export const defineFilesConfig = (config: FilesConfig): FilesConfig => config
