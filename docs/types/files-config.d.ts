import type { defineFilesConfig as defineConfig } from 'nuxt-files-sdk/config'

// This configuration is also evaluated when its development-only storage is inactive.
// Scope the build-time injected helper to this project using the package's public signature.
declare global {
    const defineFilesConfig: typeof defineConfig
}
