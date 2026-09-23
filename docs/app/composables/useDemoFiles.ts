import type { AdapterCapabilities, SearchMatch, StoredFile } from 'files-sdk'
import type { FilesClient } from 'files-sdk/client'
import { ref } from 'vue'

export function useDemoFiles() {
    const now = Date.now()
    const bodies = new Map<string, Blob>([
        ['documents/readme.txt', new Blob(['Hello from the in-memory Files demo.'], { type: 'text/plain' })],
        ['documents/notes.json', new Blob(['{"demo":true}'], { type: 'application/json' })],
        ['report.txt', new Blob(['Quarterly report'], { type: 'text/plain' })],
    ])
    const trashed = ref([{ key: 'archive/old-report.txt', size: 128, lastModified: now - 86_400_000 }])

    const stored = (key: string, body = bodies.get(key) ?? new Blob()): StoredFile => ({
        key,
        name: key.split('/').at(-1) ?? key,
        size: body.size,
        type: body.type,
        lastModified: now,
        arrayBuffer: () => body.arrayBuffer(),
        blob: async () => body,
        stream: () => body.stream(),
        text: () => body.text(),
    })

    const capabilities = {
        rangeRead: true,
        uploadProgress: true,
        delimiter: true,
        metadata: true,
        cacheControl: true,
        multipart: true,
        serverSideCopy: true,
        signedUrl: { supported: true, maxExpiresIn: 86_400 },
        conditional: {
            create: false,
            replace: false,
            exactRead: false,
            delete: false,
            copy: {
                sourceEtag: false,
                atomicSourceDestination: false,
                destinationCreate: false,
                destinationReplace: false,
            },
            multipart: { create: false, replace: false },
        },
    } satisfies AdapterCapabilities

    // ponytail: demos use single-key operations only; implement bulk overloads when an example needs them.
    /* oxlint-disable typescript/no-unsafe-type-assertion -- adapt the demo's single-key methods to the overloaded native client */
    const files: FilesClient = {
        upload: (async (key: string, body: Blob) => {
            if (!(body instanceof Blob)) throw new TypeError('Demo uploads require a File or Blob.')
            bodies.set(key, body)
            return { key, size: body.size, type: body.type || 'application/octet-stream', lastModified: Date.now() }
        }) as FilesClient['upload'],
        download: (async (key: string) => stored(key)) as FilesClient['download'],
        head: (async (key: string) => stored(key)) as FilesClient['head'],
        exists: (async (key: string) => bodies.has(key)) as FilesClient['exists'],
        delete: (async (key: string) => void bodies.delete(key)) as FilesClient['delete'],
        /* oxlint-enable typescript/no-unsafe-type-assertion */
        copy: async (from: string, to: string) => void bodies.set(to, bodies.get(from) ?? new Blob()),
        move: async (from: string, to: string) => {
            bodies.set(to, bodies.get(from) ?? new Blob())
            bodies.delete(from)
        },
        url: async (key: string) => URL.createObjectURL(bodies.get(key) ?? new Blob()),
        signedUploadUrl: async (key: string) => ({
            url: `https://example.test/upload/${key}`,
            method: 'PUT',
            headers: {},
        }),
        list: async (options = {}) => {
            const prefix = options.prefix ?? ''
            const items: StoredFile[] = []
            const prefixes = new Set<string>()
            for (const key of bodies.keys()) {
                if (!key.startsWith(prefix)) continue
                const remainder = key.slice(prefix.length)
                const slash = options.delimiter ? remainder.indexOf(options.delimiter) : -1
                if (slash >= 0) prefixes.add(prefix + remainder.slice(0, slash + 1))
                else items.push(stored(key))
            }
            return { items, prefixes: [...prefixes] }
        },
        async *listAll(options = {}) {
            const result = await files.list(options)
            yield* result.items
        },
        async *search(pattern: string | RegExp, options = {}) {
            const query = String(pattern)
            for (const key of bodies.keys()) {
                if (options.signal?.aborted || !key.startsWith(options.prefix ?? '')) continue
                const source = options.caseInsensitive ? key.toLowerCase() : key
                const needle = options.caseInsensitive ? query.toLowerCase() : query
                const matches =
                    options.match === ('exact' satisfies SearchMatch)
                        ? source === needle
                        : options.match === 'regex'
                          ? new RegExp(query, options.caseInsensitive ? 'i' : '').test(key)
                          : source.includes(needle.replaceAll('*', ''))
                if (matches) yield stored(key)
            }
        },
        capabilities: async () => capabilities,
        versions: async () => [
            { versionId: 'v2', size: 28, lastModified: now },
            { versionId: 'v1', size: 20, lastModified: now - 86_400_000 },
        ],
        restoreVersion: async (key: string) => stored(key),
        trashed: async () => [...trashed.value],
        restoreTrashed: async (key: string) => {
            const file = trashed.value.find((item) => item.key === key)
            trashed.value = trashed.value.filter((item) => item.key !== key)
            const body = new Blob(['Restored demo file'], { type: 'text/plain' })
            bodies.set(key, body)
            return stored(file?.key ?? key, body)
        },
        purge: async (key?: string) => {
            trashed.value = key ? trashed.value.filter((item) => item.key !== key) : []
        },
    }

    return files
}
