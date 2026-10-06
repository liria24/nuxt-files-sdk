import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
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
    const npmMetadata = resolve(root, 'node_modules/.package-lock.json')
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
        const changed = vi.fn<() => Promise<void>>(async () => {})
        watcher = watchFiles([...graph.files, lock, npmMetadata], changed, (error) => {
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
        // npm --package-lock=false can install a dependency without changing a root lockfile.
        // Its hidden installation metadata is still an observable development-session input.
        await mkdir(resolve(root, 'node_modules'), { recursive: true })
        const installed = JSON.stringify({ packages: { 'node_modules/files-late-dependency': { version: '1.0.0' } } })
        await writeFile(npmMetadata, installed)
        await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(3))
        await writeChanged(npmMetadata, installed)
        await new Promise((done) => setTimeout(done, 600))
        expect(changed).toHaveBeenCalledTimes(3)
        await writeFile(npmMetadata, installed.replace('1.0.0', '1.0.1'))
        await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(4))
        watcher.close()
        await writeFile(authorization, 'export const authorize = () => ({})')
        expect(developmentConfigCurrent(hashes)).toBe(true)
    } finally {
        watcher?.close()
        await rm(root, { recursive: true, force: true })
    }
})
