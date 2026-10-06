// API routes must not share the DevFrame middleware mount prefix.
export const FILES_DEVTOOLS_PATH = '/__nuxt-files-sdk/'
export const FILES_SNAPSHOT_PATH = '/__nuxt-files-api/snapshot'
export const FILES_GATEWAY_PATH = '/__nuxt-files-api/files'
export const FILES_TOKEN_PATH = '/__nuxt-files-api/token'
export const FILES_DEVTOOLS_MAX_UPLOAD_SIZE = 10 * 1024 * 1024
