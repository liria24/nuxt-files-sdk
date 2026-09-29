import { watchFile, unwatchFile } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'

import { fileHash } from '../runtime/development'

export const writeChanged = async (path: string, content: string): Promise<void> => {
    if ((await readFile(path, 'utf8').catch(() => undefined)) !== content) await writeFile(path, content)
}

/** Poll specific inputs, including missing lockfiles, without watching generated output. */
export const watchFiles = (paths: string[], changed: () => Promise<void>, failed: (error: unknown) => void) => {
    const listeners = new Map<string, () => void>()
    let timer: ReturnType<typeof setTimeout> | undefined
    let pending = false
    let running = false
    let closed = false
    const run = async () => {
        if (closed || running || !pending) return
        pending = false
        running = true
        try {
            await changed()
        } catch (error) {
            failed(error)
        } finally {
            running = false
            if (pending && !closed) void run()
        }
    }
    const add = (files: string[]) => {
        for (const path of files) {
            if (listeners.has(path)) continue
            let hash = fileHash(path)
            const listener = () => {
                const next = fileHash(path)
                if (hash === next) return
                hash = next
                pending = true
                clearTimeout(timer)
                timer = setTimeout(() => void run(), 100)
                timer.unref()
            }
            listeners.set(path, listener)
            watchFile(path, { interval: 250, persistent: false }, listener)
        }
    }
    add(paths)
    return {
        add,
        close() {
            closed = true
            clearTimeout(timer)
            for (const [path, listener] of listeners) unwatchFile(path, listener)
        },
    }
}
