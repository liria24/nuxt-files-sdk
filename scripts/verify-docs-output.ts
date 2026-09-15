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

process.stdout.write('Production docs contain no DevTools routes, development storage, AI layer, or Markdown bodies.\n')
