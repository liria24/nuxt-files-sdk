import type { AdapterCapabilities, StoredFile } from 'files-sdk'
import { createFilesClient, type FilesClient } from 'files-sdk/client'

interface Snapshot {
    storages: Array<{
        name?: string
        adapter: string
        plugins: string[]
        source: 'storage' | 'devStorage'
        initialized: boolean
    }>
    diagnostics: Array<{ code: string; level: 'info' | 'warning' | 'error'; message: string }>
}

interface Access {
    write: boolean
    maxUploadSize: number
}

const element = <T extends Element>(selector: string, kind: new () => T): T => {
    const match = document.querySelector(selector)
    if (!(match instanceof kind)) throw new Error(`Missing DevTools element: ${selector}`)
    return match
}

const summary = element('#summary', HTMLElement)
const storageSelect = element('#storage-select', HTMLSelectElement)
const breadcrumbs = element('#breadcrumbs', HTMLElement)
const filesBody = element('#files', HTMLTableSectionElement)
const browserStatus = element('#browser-status', HTMLElement)
const accessBadge = element('#access-badge', HTMLElement)
const refreshButton = element('#refresh', HTMLButtonElement)
const uploadInput = element('#upload', HTMLInputElement)
const uploadButton = element('.upload-button', HTMLElement)

let snapshot: Snapshot
let access: Access
let storage: string | undefined
let prefix = ''
let loadId = 0
const capabilities = new Map<string, AdapterCapabilities>()

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object'
const isSnapshot = (value: unknown): value is Snapshot =>
    isRecord(value) &&
    Array.isArray(value.storages) &&
    value.storages.every(
        (item) =>
            isRecord(item) &&
            (item.name === undefined || typeof item.name === 'string') &&
            typeof item.adapter === 'string' &&
            Array.isArray(item.plugins) &&
            item.plugins.every((plugin) => typeof plugin === 'string') &&
            (item.source === 'storage' || item.source === 'devStorage') &&
            typeof item.initialized === 'boolean',
    ) &&
    Array.isArray(value.diagnostics) &&
    value.diagnostics.every(
        (item) =>
            isRecord(item) &&
            typeof item.code === 'string' &&
            (item.level === 'info' || item.level === 'warning' || item.level === 'error') &&
            typeof item.message === 'string',
    )
const isAccess = (value: unknown): value is Access =>
    isRecord(value) && typeof value.write === 'boolean' && typeof value.maxUploadSize === 'number'
const fetchJson = async (url: string): Promise<unknown> => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`DevTools request failed (${response.status}).`)
    return response.json()
}

const endpoint = (): string => (storage === undefined ? './files' : `./files?storage=${encodeURIComponent(storage)}`)
const client = (): FilesClient => createFilesClient({ endpoint: endpoint() })
const storageKey = (): string => storage ?? ''

const showStatus = (message: string, error = false): void => {
    browserStatus.textContent = message
    browserStatus.classList.toggle('error-text', error)
}

const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    const units = ['KB', 'MB', 'GB', 'TB']
    let value = bytes
    let unit = -1
    do {
        value /= 1024
        unit++
    } while (value >= 1024 && unit < units.length - 1)
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

const displayName = (key: string): string => key.slice(prefix.length).replace(/\/$/u, '') || key

const actionButton = (label: string, action: () => void): HTMLButtonElement => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'row-action'
    button.textContent = label
    button.addEventListener('click', action)
    return button
}

const renderBreadcrumbs = (): void => {
    const parts = prefix.split('/').filter(Boolean)
    const nodes: Node[] = []
    const root = actionButton('Root', () => {
        prefix = ''
        void loadFiles()
    })
    root.className = 'breadcrumb'
    nodes.push(root)
    let path = ''
    for (const part of parts) {
        nodes.push(document.createTextNode('/'))
        path += `${part}/`
        const target = path
        const button = actionButton(part, () => {
            prefix = target
            void loadFiles()
        })
        button.className = 'breadcrumb'
        nodes.push(button)
    }
    breadcrumbs.replaceChildren(...nodes)
}

const fileRow = (file: StoredFile): HTMLTableRowElement => {
    const row = document.createElement('tr')
    const name = document.createElement('td')
    name.className = 'file-name'
    name.textContent = displayName(file.key)
    const size = document.createElement('td')
    size.textContent = formatBytes(file.size)
    const type = document.createElement('td')
    type.textContent = file.type || 'application/octet-stream'
    const modified = document.createElement('td')
    modified.textContent = file.lastModified ? new Date(file.lastModified).toLocaleString() : '—'
    const actions = document.createElement('td')
    actions.className = 'actions'
    actions.append(
        actionButton('Download', () => void downloadFile(file.key)),
        ...(access.write ? [actionButton('Delete', () => void deleteFile(file.key))] : []),
    )
    row.append(name, size, type, modified, actions)
    return row
}

const folderRow = (folder: string): HTMLTableRowElement => {
    const row = document.createElement('tr')
    const name = document.createElement('td')
    name.className = 'file-name'
    const button = actionButton(`📁 ${displayName(folder)}`, () => {
        prefix = folder
        void loadFiles()
    })
    button.className = 'folder'
    name.append(button)
    const details = document.createElement('td')
    details.colSpan = 4
    details.className = 'folder-detail'
    details.textContent = 'Folder'
    row.append(name, details)
    return row
}

const loadFiles = async (): Promise<void> => {
    const requestId = ++loadId
    renderBreadcrumbs()
    filesBody.innerHTML = '<tr><td colspan="5" class="empty-state">Loading files…</td></tr>'
    showStatus('Loading…')
    try {
        const files = client()
        let adapterCapabilities = capabilities.get(storageKey())
        if (!adapterCapabilities) {
            adapterCapabilities = await files.capabilities()
            capabilities.set(storageKey(), adapterCapabilities)
        }
        const result = await files.list({
            prefix,
            limit: 1000,
            ...(adapterCapabilities.delimiter ? { delimiter: '/' } : {}),
        })
        if (requestId !== loadId) return
        const rows = [
            ...(result.prefixes ?? []).toSorted().map(folderRow),
            ...result.items.toSorted((left, right) => left.key.localeCompare(right.key)).map(fileRow),
        ]
        if (rows.length) filesBody.replaceChildren(...rows)
        else filesBody.innerHTML = '<tr><td colspan="5" class="empty-state">No files in this location.</td></tr>'
        showStatus(`${rows.length} item${rows.length === 1 ? '' : 's'}${result.cursor ? ' · first page' : ''}`)
    } catch (error) {
        if (requestId !== loadId) return
        filesBody.innerHTML = '<tr><td colspan="5" class="empty-state">Unable to load files.</td></tr>'
        showStatus(error instanceof Error ? error.message : String(error), true)
    }
}

const downloadFile = async (key: string): Promise<void> => {
    showStatus(`Downloading ${key}…`)
    try {
        const file = await client().download(key, { as: 'blob' })
        const url = URL.createObjectURL(await file.blob())
        const link = document.createElement('a')
        link.href = url
        link.download = key.split('/').at(-1) || key
        link.click()
        setTimeout(() => URL.revokeObjectURL(url))
        showStatus(`Downloaded ${key}`)
    } catch (error) {
        showStatus(error instanceof Error ? error.message : String(error), true)
    }
}

const deleteFile = async (key: string): Promise<void> => {
    if (!window.confirm(`Delete ${key}? This cannot be undone.`)) return
    showStatus(`Deleting ${key}…`)
    try {
        await client().delete(key)
        await loadFiles()
    } catch (error) {
        showStatus(error instanceof Error ? error.message : String(error), true)
    }
}

const uploadFile = async (file: File): Promise<void> => {
    const key = `${prefix}${file.name}`
    if (file.size > access.maxUploadSize) {
        showStatus(`${file.name} exceeds the ${formatBytes(access.maxUploadSize)} development upload limit.`, true)
        return
    }
    const files = client()
    try {
        if ((await files.exists(key)) && !window.confirm(`Replace the existing file ${key}?`)) return
        showStatus(`Uploading ${key}…`)
        await files.upload(key, file, { contentType: file.type || 'application/octet-stream' })
        await loadFiles()
    } catch (error) {
        showStatus(error instanceof Error ? error.message : String(error), true)
    }
}

const renderSnapshot = (): void => {
    summary.textContent = `${snapshot.storages.length} configured storage${snapshot.storages.length === 1 ? '' : 's'}`
    element('#storages', HTMLTableSectionElement).replaceChildren(
        ...snapshot.storages.map((item) => {
            const row = document.createElement('tr')
            for (const value of [
                item.name ?? 'Single storage',
                item.adapter,
                item.plugins.join(', ') || '—',
                item.source,
            ]) {
                const cell = document.createElement('td')
                cell.textContent = value
                row.append(cell)
            }
            const statusCell = document.createElement('td')
            const status = document.createElement('span')
            status.className = `status ${item.initialized ? 'success' : 'idle'}`
            status.textContent = item.initialized ? 'Initialized' : 'Not initialized'
            statusCell.append(status)
            row.append(statusCell)
            return row
        }),
    )
    const diagnostics = element('#diagnostics', HTMLElement)
    if (!snapshot.diagnostics.length) diagnostics.textContent = 'No integration diagnostics.'
    else
        diagnostics.replaceChildren(
            ...snapshot.diagnostics.map((item) => {
                const message = document.createElement('p')
                message.className = item.level
                message.textContent = `${item.code}: ${item.message}`
                return message
            }),
        )
}

const initialize = async (): Promise<void> => {
    try {
        const [snapshotResponse, accessResponse] = await Promise.all([
            fetchJson('./snapshot'),
            fetchJson('./files?op=devtools'),
        ])
        if (!isSnapshot(snapshotResponse) || !isAccess(accessResponse)) {
            throw new Error('Files development tools returned an invalid response.')
        }
        snapshot = snapshotResponse
        access = accessResponse
        renderSnapshot()
        storageSelect.replaceChildren(
            ...snapshot.storages.map((item) => {
                const option = document.createElement('option')
                option.value = item.name ?? ''
                option.textContent = item.name ?? 'Single storage'
                return option
            }),
        )
        storageSelect.hidden = snapshot.storages.length < 2
        storage = snapshot.storages[0]?.name
        accessBadge.textContent = access.write ? 'Read & write' : 'Read only'
        accessBadge.className = `access-badge ${access.write ? 'write' : ''}`
        uploadInput.disabled = !access.write
        uploadButton.hidden = !access.write
        if (snapshot.storages.length) await loadFiles()
        else showStatus('No configured storage.', true)
    } catch (error) {
        summary.textContent = 'Unable to load Files development tools'
        showStatus(error instanceof Error ? error.message : String(error), true)
    }
}

storageSelect.addEventListener('change', () => {
    storage = storageSelect.value || undefined
    prefix = ''
    void loadFiles()
})
refreshButton.addEventListener('click', () => void loadFiles())
uploadInput.addEventListener('change', () => {
    const file = uploadInput.files?.[0]
    uploadInput.value = ''
    if (file) void uploadFile(file)
})

void initialize()
