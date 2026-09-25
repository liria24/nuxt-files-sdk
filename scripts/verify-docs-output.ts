import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve(import.meta.dirname, '../docs/.output')
const forbidden = [
    '__nuxt-files-sdk',
    'files-devtools',
    'files-sdk/fs',
    'configureFiles',
    'comark-docs',
    '@nuxtjs/mcp-toolkit',
    'Files SDK, wired for Nuxt',
]
let hasLlmsRoute = false

await Promise.all(
    (await readdir(output, { recursive: true, withFileTypes: true }))
        .filter((path) => path.isFile())
        .map(async (path) => {
            const file = resolve(path.parentPath, path.name)
            const content = await readFile(file, 'utf8')
            hasLlmsRoute ||= /route\s*:\s*['"]\/llms\.txt['"]/.test(content)
            for (const marker of forbidden) {
                if (content.includes(marker)) throw new Error(`${marker} found in ${file}`)
            }
        }),
)

const wrangler = await readFile(resolve(output, 'server/wrangler.json'), 'utf8')
for (const required of ['nuxt-files-sdk-docs', 'nuxt-files-sdk.liria.me', 'DOCS_CACHE']) {
    if (!wrangler.includes(required)) throw new Error(`${required} missing from generated Wrangler config`)
}
const config: unknown = JSON.parse(wrangler)
const cache = config && typeof config === 'object' && 'cache' in config ? config.cache : undefined
if (
    !cache ||
    typeof cache !== 'object' ||
    !('enabled' in cache) ||
    !('cross_version_cache' in cache) ||
    cache.enabled !== true ||
    cache.cross_version_cache !== false
) {
    throw new Error('Workers Cache must be enabled and isolated per deployment.')
}
const headers = await readFile(resolve(output, 'public/_headers'), 'utf8')
if (/^\/\*\r?\n\s+cache-control:\s*no-store/mu.test(headers)) {
    throw new Error('A global no-store rule would override static asset caching.')
}
if (!/^\/_nuxt\/\*\r?\n\s+cache-control:\s*public, max-age=31536000, immutable/mu.test(headers)) {
    throw new Error('Immutable Nuxt asset headers are missing.')
}
if (existsSync(resolve(output, 'public/llms.txt'))) throw new Error('llms.txt must be generated at runtime')
if (!hasLlmsRoute) throw new Error('llms.txt runtime route is missing')
const deployConfig = await readFile(resolve(output, '../.wrangler/deploy/config.json'), 'utf8')
if (!deployConfig.includes('wrangler.json')) throw new Error('Nitro Wrangler deploy redirect is missing')

process.stdout.write('Production docs contain no DevTools routes, development storage, AI layer, or Markdown bodies.\n')
