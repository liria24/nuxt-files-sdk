import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { expect, test } from 'vite-plus/test'

import { createLspWatchers } from '../utils/lsp-watchers'

test('[LSP-001] recursive client watches include hidden generated and pnpm files and release registrations', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'files-lsp-watch-'))
    const events: { uri: string; type: number }[] = []
    const errors: unknown[] = []
    const watches = createLspWatchers(
        async (changes) => {
            events.push(...changes)
        },
        (error) => errors.push(error),
    )
    try {
        watches.register([
            {
                id: 'files',
                method: 'workspace/didChangeWatchedFiles',
                registerOptions: { watchers: [{ globPattern: `${root.replaceAll('\\', '/')}/**/*` }] },
            },
        ])
        const files = ['sample.ts', '.nuxt/types.d.ts', 'node_modules/.pnpm/typescript/package.json']
        for (const name of files) {
            const file = resolve(root, name)
            await mkdir(resolve(file, '..'), { recursive: true })
            await writeFile(file, 'export const value = 1')
            await expect.poll(() => events.some((event) => event.uri === pathToFileURL(file).href)).toBe(true)
        }
        watches.unregister('files')
        await new Promise((done) => setTimeout(done, 50))
        const count = events.length
        await writeFile(resolve(root, files[0]!), 'export const value = 2')
        await new Promise((done) => setTimeout(done, 100))
        expect(events).toHaveLength(count)
        expect(errors).toEqual([])
    } finally {
        watches.close()
        await rm(root, { recursive: true, force: true })
    }
})

test('[LSP-001] shallow client watches filter descendants when the registered directory is initially missing', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'files-lsp-watch-'))
    const directory = resolve(root, '.nuxt')
    const events: { uri: string; type: number }[] = []
    const errors: unknown[] = []
    const watches = createLspWatchers(
        async (changes) => {
            events.push(...changes)
        },
        (error) => errors.push(error),
    )
    try {
        watches.register([
            {
                id: 'shallow',
                method: 'workspace/didChangeWatchedFiles',
                registerOptions: {
                    watchers: [{ globPattern: `${directory.replaceAll('\\', '/')}/*` }],
                },
            },
        ])
        await mkdir(resolve(directory, 'nested'), { recursive: true })
        const direct = resolve(directory, '.types.d.ts')
        const nested = resolve(directory, 'nested/types.d.ts')
        await writeFile(direct, 'export {}')
        await expect.poll(() => events.some((event) => event.uri === pathToFileURL(direct).href)).toBe(true)
        await writeFile(nested, 'export {}')
        await new Promise((done) => setTimeout(done, 100))
        expect(events.some((event) => event.uri === pathToFileURL(nested).href)).toBe(false)
        expect(errors).toEqual([])
    } finally {
        watches.close()
        await rm(root, { recursive: true, force: true })
    }
})

test('[LSP-001] unsupported watcher patterns fail explicitly', () => {
    const watches = createLspWatchers(
        async () => {},
        () => {},
    )
    try {
        expect(() =>
            watches.register([
                {
                    id: 'unsupported',
                    method: 'workspace/didChangeWatchedFiles',
                    registerOptions: {
                        watchers: [{ globPattern: `${resolve('test').replaceAll('\\', '/')}/*.ts` }],
                    },
                },
            ]),
        ).toThrow('Unsupported TypeScript LSP watch pattern')
    } finally {
        watches.close()
    }
})
