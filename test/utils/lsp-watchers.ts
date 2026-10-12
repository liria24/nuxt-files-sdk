import { existsSync, watch, type FSWatcher } from 'node:fs'
import { stat } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
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
                    // TypeScript 7 registers absolute directory/**/* or directory/* patterns.
                    // Match their directory scope directly so .nuxt and .pnpm are included.
                    const pattern = normalize(globPattern)
                    const suffix = pattern.endsWith('/**/*') ? '/**/*' : pattern.endsWith('/*') ? '/*' : undefined
                    if (!suffix || !isAbsolute(globPattern) || /[?*{}[\]]/u.test(pattern.slice(0, -suffix.length)))
                        throw new Error(`Unsupported TypeScript LSP watch pattern: ${globPattern}`)
                    const directory = resolve(globPattern.slice(0, -suffix.length))
                    const prefix = `${normalize(directory).replace(/\/$/u, '')}/`
                    let root = directory
                    while (!existsSync(root) && dirname(root) !== root) root = dirname(root)
                    const watcher = watch(root, { recursive: true }, (event, name) => {
                        if (!name || registrations.get(registration.id) !== owned) return
                        const file = resolve(root, name)
                        const normalized = normalize(file)
                        if (!normalized.startsWith(prefix)) return
                        if (suffix === '/*' && normalized.slice(prefix.length).includes('/')) return
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
