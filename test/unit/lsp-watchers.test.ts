import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { expect, test } from 'vite-plus/test'

import { createLspWatchers } from '../utils/lsp-watchers'

test('[LSP-001] client watches emit real file changes and release registrations', async () => {
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
                registerOptions: { watchers: [{ globPattern: `${root.replaceAll('\\', '/')}/*.ts` }] },
            },
        ])
        const file = resolve(root, 'sample.ts')
        await writeFile(file, 'export const value = 1')
        for (
            let attempt = 0;
            attempt < 100 && !events.some((event) => event.uri === pathToFileURL(file).href);
            attempt++
        )
            await new Promise((done) => setTimeout(done, 20))
        expect(events.some((event) => event.uri === pathToFileURL(file).href)).toBe(true)
        watches.unregister('files')
        await new Promise((done) => setTimeout(done, 50))
        const count = events.length
        await writeFile(file, 'export const value = 2')
        await new Promise((done) => setTimeout(done, 100))
        expect(events).toHaveLength(count)
        expect(errors).toEqual([])
    } finally {
        watches.close()
        await rm(root, { recursive: true, force: true })
    }
})
