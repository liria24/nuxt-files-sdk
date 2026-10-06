import { resolve } from 'node:path'

import { expect, test, vi } from 'vitest'

import { inlineNuxtRuntime, selectedSourcePlugin } from '../../packages/nuxt-files-sdk/src/integration/nitro'

test('Nuxt runtime inlining preserves native Windows and nested pnpm resolver paths', () => {
    for (const name of ['nuxt', 'nuxt3', 'nuxt-nightly']) {
        for (const prefix of ['D:/app/node_modules/', 'C:/app/node_modules/.pnpm/' + name + '@4.6.0/node_modules/']) {
            const path = prefix + name + '/dist/runtime/server/renderer/index.js'
            expect(inlineNuxtRuntime(path.replaceAll('/', '\\'))).toBe(true)
            expect(inlineNuxtRuntime(path)).toBe(false)
        }
    }
    for (const path of [
        'D:/app/server/api/index.ts',
        'D:/app/node_modules/h3/dist/index.mjs',
        'D:/app/node_modules/nuxt-files-sdk/dist/runtime/index.js',
        'D:/app/node_modules/nuxt/package.json',
        'D:/app/node_modules/nuxt/dist-other/index.js',
    ]) {
        expect(inlineNuxtRuntime(path.replaceAll('/', '\\'))).toBe(false)
    }
})

type Resolver = (id: string, importer: string, options: { skipSelf: true }) => Promise<{ id: string } | null>
test.each(['selected.ts', 'selected.dev.ts'])(
    'only %s receives a non-NUL TypeScript identity outside node_modules',
    async (filename) => {
        const configPath = resolve('/files-consumer/files.config.ts')
        const selected = resolve('/files-consumer/node_modules/.cache/nuxt/.nuxt/nuxt-files-sdk', filename)
        const source = `import { policy } from './policy'\nconst secret: string = process.env.FILES_ROUTE_SECRET!\nexport default { storage: { adapter: 'memory' }, routes: [{ path: '/files', authorize: policy, secret }] }\n`
        const plugin = selectedSourcePlugin({ selected, source, configPath })
        const resolver = vi.fn<Resolver>().mockResolvedValue({ id: '/files-consumer/policy.ts' })
        const context = { resolve: resolver }
        const resolveId = plugin.resolveId.bind(context)
        const load = plugin.load.bind(plugin)
        const virtualId = `nuxt-files-sdk:${filename}`

        expect(await resolveId(selected)).toBe(virtualId)
        expect(await resolveId(selected.replaceAll('/', '\\'))).toBe(virtualId)
        expect(virtualId).not.toContain('\0')
        expect(virtualId).not.toContain('node_modules')
        expect(virtualId).toMatch(/\.ts$/u)
        expect(load(virtualId)).toBe(source)
        expect(load(selected)).toBeNull()
        expect(resolver).not.toHaveBeenCalled()

        for (const other of [selected + '?v=1', selected + '.map', '/other/selected.ts', 'unrelated-package']) {
            expect(await resolveId(other)).toBeNull()
            expect(load(other)).toBeNull()
        }
        expect(resolver).not.toHaveBeenCalled()

        for (const dependency of ['./policy', '@layer/policy', '#files-sdk/memory']) {
            expect(await resolveId(dependency, virtualId)).toEqual({ id: '/files-consumer/policy.ts' })
            expect(resolver).toHaveBeenLastCalledWith(dependency, configPath, { skipSelf: true })
        }
        expect(await resolveId('./policy', '/unrelated/importer.ts')).toBeNull()
        expect(resolver).toHaveBeenCalledTimes(3)
    },
)
