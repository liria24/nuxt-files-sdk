import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { expect, test, vi } from 'vitest'

import { gatewayRoutes } from '../../packages/nuxt-files-sdk/src/config/prepare'
import { configSources } from '../../packages/nuxt-files-sdk/src/integration/imports'
import { watchFiles, writeChanged } from '../../packages/nuxt-files-sdk/src/integration/update'
import { developmentConfigCurrent, fileHash } from '../../packages/nuxt-files-sdk/src/runtime/development'

test('[UPDATE-001] tracks Layer aliases and referenced config, suppresses unchanged writes, and fails closed', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'files-update-'))
    const config = resolve(root, 'files.config.ts')
    const authorization = resolve(root, 'authorize.ts')
    const lock = resolve(root, 'bun.lock')
    let watcher: ReturnType<typeof watchFiles> | undefined
    try {
        await writeFile(
            config,
            "import { authorize } from '@layer/authorize'; export default { storage: { adapter: 'memory' }, routes: [{ path: '/files', authorize }] }",
        )
        await writeFile(authorization, 'export const authorize = () => ({})')
        const graph = configSources(config, { '@layer': root })
        expect(graph.files).toEqual([config, authorization])
        const hashes = Object.fromEntries(graph.files.map((path) => [path, fileHash(path)]))
        expect(developmentConfigCurrent(hashes)).toBe(true)
        const original = await readFile(config, 'utf8')
        const before = (await stat(config)).mtimeMs
        await writeChanged(config, original)
        expect((await stat(config)).mtimeMs).toBe(before)
        const changed = vi.fn(async () => {})
        watcher = watchFiles([...graph.files, lock], changed, (error) => {
            throw error
        })
        await writeFile(authorization, 'export const authorize = false')
        expect(developmentConfigCurrent(hashes)).toBe(false)
        expect(() =>
            gatewayRoutes({ storage: { adapter: 'memory' }, routes: [{ path: '/files', authorize: false }] }),
        ).toThrow('authorize must be a function')
        await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1))
        await writeFile(lock, 'new dependencies')
        await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(2))
        watcher.close()
        await writeFile(authorization, 'export const authorize = () => ({})')
        expect(developmentConfigCurrent(hashes)).toBe(true)
    } finally {
        watcher?.close()
        await rm(root, { recursive: true, force: true })
    }
})
