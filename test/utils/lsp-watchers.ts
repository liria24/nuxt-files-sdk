import { existsSync, watch, type FSWatcher } from 'node:fs'
import { stat } from 'node:fs/promises'
import { dirname, matchesGlob, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

interface Registration {
    id: string
    method: string
    registerOptions?: { watchers?: { globPattern: string; kind?: number }[] }
}

const normalize = (path: string) => {
    const value = path.replaceAll('\\', '/')
    return process.platform === 'win32' ? value.toLowerCase() : value
}

/** Honor dynamic LSP watch registrations with client-owned Node watchers. */
export const createLspWatchers = (
    changed: (changes: { uri: string; type: number }[]) => Promise<void>,
    failed: (error: unknown) => void,
    baseDirectory = process.cwd(),
) => {
    const registrations = new Map<string, FSWatcher[]>()
    const unregister = (id: string) => {
        for (const watcher of registrations.get(id) ?? []) watcher.close()
        registrations.delete(id)
    }
    return {
        register(items: Registration[]) {
            for (const registration of items) {
                if (registration.method !== 'workspace/didChangeWatchedFiles') continue
                unregister(registration.id)
                const owned: FSWatcher[] = []
                registrations.set(registration.id, owned)
                for (const { globPattern, kind = 7 } of registration.registerOptions?.watchers ?? []) {
                    const absolute = resolve(baseDirectory, globPattern)
                    const pattern = normalize(absolute)
                    const wildcard = pattern.search(/[?*{[]/u)
                    const prefix = wildcard < 0 ? absolute : absolute.slice(0, wildcard)
                    let root = wildcard >= 0 && /[/\\]$/u.test(prefix) ? resolve(prefix) : dirname(prefix)
                    while (!existsSync(root) && dirname(root) !== root) root = dirname(root)
                    const watcher = watch(root, { recursive: true }, (event, name) => {
                        if (!name || registrations.get(registration.id) !== owned) return
                        const file = resolve(root, name)
                        if (!matchesGlob(normalize(file), pattern)) return
                        void (async () => {
                            let type = event === 'change' ? 2 : 1
                            try {
                                await stat(file)
                            } catch (error) {
                                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
                                type = 3
                            }
                            if (registrations.get(registration.id) === owned && kind & (1 << (type - 1)))
                                await changed([{ uri: pathToFileURL(file).href, type }])
                        })().catch(failed)
                    })
                    watcher.on('error', failed)
                    owned.push(watcher)
                }
            }
        },
        unregister,
        close() {
            for (const id of registrations.keys()) unregister(id)
        },
    }
}
