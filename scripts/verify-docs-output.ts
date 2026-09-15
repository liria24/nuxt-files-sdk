import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve(import.meta.dirname, '../docs/.output')
const forbidden = [
    '__nuxt-files-sdk',
    'files-devtools',
    'files-sdk/fs',
    'nuxt-files-sdk/runtime',
    'configureFiles',
    'comark-docs',
    '@nuxtjs/mcp-toolkit',
    'Files SDK, wired for Nuxt',
]

await Promise.all(
    (await readdir(output, { recursive: true, withFileTypes: true }))
        .filter((path) => path.isFile())
        .map(async (path) => {
            const file = resolve(path.parentPath, path.name)
            const content = await readFile(file, 'utf8')
            for (const marker of forbidden) {
                if (content.includes(marker)) throw new Error(`${marker} found in ${file}`)
            }
        }),
)

const wrangler = await readFile(resolve(output, 'server/wrangler.json'), 'utf8')
for (const required of ['nuxt-files-sdk-docs', 'nuxt-files-sdk.liria.me', 'DOCS_CACHE']) {
    if (!wrangler.includes(required)) throw new Error(`${required} missing from generated Wrangler config`)
}
const deployConfig = await readFile(resolve(output, '../.wrangler/deploy/config.json'), 'utf8')
if (!deployConfig.includes('wrangler.json')) throw new Error('Nitro Wrangler deploy redirect is missing')

process.stdout.write('Production docs contain no DevTools routes, development storage, AI layer, or Markdown bodies.\n')
