import type { AdapterCapabilities } from 'files-sdk'
import type { FilesClient } from 'files-sdk/client'

/** One visible page; requests and operations retain the location they started in. */
export class FilesBrowser {
    storage: string | undefined
    prefix = ''
    readonly #client: (storage?: string) => FilesClient
    readonly #capabilities = new Map<string | undefined, AdapterCapabilities>()
    #revision = 0
    #cursors: (string | undefined)[] = [undefined]
    #next: string | undefined

    constructor(client: (storage?: string) => FilesClient) {
        this.#client = client
    }

    get hasPrevious(): boolean {
        return this.#cursors.length > 1
    }
    get hasNext(): boolean {
        return this.#next !== undefined
    }
    get initializing(): boolean {
        return !this.#capabilities.has(this.storage)
    }

    navigate(storage: string | undefined, prefix = ''): void {
        this.storage = storage
        this.prefix = prefix
        this.reset()
    }

    reset(refreshCapabilities = false): void {
        this.#revision++
        this.#cursors = [undefined]
        this.#next = undefined
        if (refreshCapabilities) this.#capabilities.clear()
    }

    next(): void {
        if (!this.hasNext) return
        this.#cursors.push(this.#next)
        this.#next = undefined
        this.#revision++
    }

    previous(): void {
        if (!this.hasPrevious) return
        this.#cursors.pop()
        this.#next = undefined
        this.#revision++
    }

    capture() {
        const revision = this.#revision
        return {
            storage: this.storage,
            prefix: this.prefix,
            client: this.#client(this.storage),
            current: () => revision === this.#revision,
        }
    }

    async list() {
        this.#revision++
        const request = this.capture()
        const cursor = this.#cursors.at(-1)
        try {
            let capabilities = this.#capabilities.get(request.storage)
            if (!capabilities) {
                capabilities = await request.client.capabilities()
                if (!request.current()) return undefined
                this.#capabilities.set(request.storage, capabilities)
            }
            const result = await request.client.list({
                prefix: request.prefix,
                limit: 1000,
                ...(cursor === undefined ? {} : { cursor }),
                ...(capabilities.delimiter ? { delimiter: '/' } : {}),
            })
            if (!request.current()) return undefined
            this.#next = result.cursor || undefined
            return result
        } catch (error) {
            if (request.current()) throw error
            return undefined
        }
    }
}
