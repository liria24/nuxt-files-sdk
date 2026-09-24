import { connectDevframe } from 'devframe/client'
import type { StoredFile } from 'files-sdk'
import { createFilesClient } from 'files-sdk/client'

import { isFilesDevtoolsDiagnostic, type FilesDevtoolsFailure } from '../diagnostics'
import type { FilesDevtoolsSnapshot as Snapshot } from '../snapshot'
import { FilesBrowser } from './browser'

interface Access {
    write: boolean
    maxUploadSize: number
}

interface AccessToken {
    token: string
    expiresAt: number
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
let initializationId = 0
let initializationController: AbortController | undefined
let snapshotController: AbortController | undefined
let devframe: Awaited<ReturnType<typeof connectDevframe>> | undefined
let bridgeReady: Promise<void>
let accessToken: AccessToken | undefined
let accessTokenRequest: Promise<AccessToken> | undefined
const previousButton = element('#previous-page', HTMLButtonElement)
const nextButton = element('#next-page', HTMLButtonElement)

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
            typeof item.initialized === 'boolean',
    ) &&
    Array.isArray(value.diagnostics) &&
    value.diagnostics.every(isFilesDevtoolsDiagnostic)
const isAccess = (value: unknown): value is Access =>
    isRecord(value) && typeof value.write === 'boolean' && typeof value.maxUploadSize === 'number'
const isAccessToken = (value: unknown): value is AccessToken =>
    isRecord(value) && typeof value.token === 'string' && typeof value.expiresAt === 'number'
const requestAccessToken = async (): Promise<AccessToken> => {
    if (new URL(window.location.href).searchParams.get('host') === 'nuxt-v3') {
        // Nuxt DevTools v3 stores the token after its native authorization flow.
        const token = localStorage.getItem('__nuxt_dev_token__')
        if (!token) throw new Error('Authorize this browser in Nuxt DevTools, then refresh Files.')
        const response = await fetch('./token', { headers: { 'x-nuxt-devtools-token': token } })
        if (!response.ok) throw new Error(`DevTools authentication failed (${response.status}).`)
        const value: unknown = await response.json()
        if (isAccessToken(value)) return value
        throw new Error('Files development tools returned an invalid access token.')
    }
    await bridgeReady
    const value: unknown = await devframe?.scope('nuxt-files-sdk').rpc.call('issue-http-token')
    if (isAccessToken(value)) return value
    throw new Error('Files development tools require a trusted DevFrame connection.')
}
const getAccessToken = async (): Promise<string> => {
    if (accessToken && accessToken.expiresAt - Date.now() > 10_000) return accessToken.token
    accessTokenRequest ??= requestAccessToken().finally(() => (accessTokenRequest = undefined))
    accessToken = await accessTokenRequest
    return accessToken.token
}
const authorizationHeaders = async (): Promise<HeadersInit> => ({ authorization: `Bearer ${await getAccessToken()}` })
const fetchJson = async (url: string, signal?: AbortSignal): Promise<unknown> => {
    const response = await fetch(url, { headers: await authorizationHeaders(), ...(signal && { signal }) })
    if (!response.ok) throw new Error(`DevTools request failed (${response.status}).`)
    return response.json()
}

const browser = new FilesBrowser((storage) =>
    createFilesClient({
        endpoint: storage === undefined ? './files' : './files?storage=' + encodeURIComponent(storage),
        headers: authorizationHeaders,
    }),
)

const showStatus = (message: string, error = false): void => {
    browserStatus.textContent = message
    browserStatus.classList.toggle('error-text', error)
}

const reportFailure = async (failure: FilesDevtoolsFailure, current: () => boolean): Promise<void> => {
    await bridgeReady
    if (current()) devframe?.scope('nuxt-files-sdk').rpc.callEvent('report-failure', failure)
}

const publishDiagnostics = async (): Promise<void> => {
    const reportedSnapshot = snapshot
    await bridgeReady
    if (snapshot === reportedSnapshot)
        devframe?.scope('nuxt-files-sdk').rpc.callEvent('report-diagnostics', reportedSnapshot.diagnostics)
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

const displayName = (key: string): string => key.slice(browser.prefix.length).replace(/\/$/u, '') || key

const actionButton = (label: string, action: () => void): HTMLButtonElement => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'row-action'
    button.textContent = label
    button.addEventListener('click', action)
    return button
}

const renderBreadcrumbs = (): void => {
    const parts = browser.prefix.split('/').filter(Boolean)
    const nodes: Node[] = []
    const root = actionButton('Root', () => {
        browser.navigate(browser.storage)
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
            browser.navigate(browser.storage, target)
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
        browser.navigate(browser.storage, folder)
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

const refreshSnapshot = async (request: ReturnType<FilesBrowser['capture']>, force = false): Promise<void> => {
    if (!force && snapshot.storages.find(({ name }) => name === request.storage)?.initialized) return
    snapshotController?.abort()
    const controller = (snapshotController = new AbortController())
    try {
        const next = await fetchJson('./snapshot', controller.signal)
        if (request.current() && !controller.signal.aborted && isSnapshot(next)) {
            snapshot = next
            renderSnapshot()
            void publishDiagnostics()
        }
    } catch {
        // A stale metadata request must not replace a successful file listing.
    }
}

const loadFiles = async (): Promise<void> => {
    snapshotController?.abort()
    const initializing = browser.initializing
    renderBreadcrumbs()
    filesBody.innerHTML = '<tr><td colspan="5" class="empty-state">Loading files…</td></tr>'
    showStatus('Loading…')
    previousButton.disabled = true
    nextButton.disabled = true
    const pending = browser.list()
    const request = browser.capture()
    try {
        const result = await pending
        if (!request.current() || !result) return
        const rows = [
            ...(result.prefixes ?? []).toSorted().map(folderRow),
            ...result.items.toSorted((left, right) => left.key.localeCompare(right.key)).map(fileRow),
        ]
        if (rows.length) filesBody.replaceChildren(...rows)
        else filesBody.innerHTML = '<tr><td colspan="5" class="empty-state">No files in this location.</td></tr>'
        showStatus(`${rows.length} item${rows.length === 1 ? '' : 's'}`)
        previousButton.disabled = !browser.hasPrevious
        nextButton.disabled = !browser.hasNext
        void refreshSnapshot(request)
    } catch (error) {
        if (!request.current()) return
        filesBody.innerHTML = '<tr><td colspan="5" class="empty-state">Unable to load files.</td></tr>'
        const message = error instanceof Error ? error.message : String(error)
        showStatus(message, true)
        void reportFailure(
            {
                kind: initializing ? 'initialization' : 'gateway',
                message,
                ...(browser.storage === undefined ? {} : { target: browser.storage }),
            },
            request.current,
        )
        previousButton.disabled = !browser.hasPrevious
        await refreshSnapshot(request, true)
    }
}

const downloadFile = async (key: string): Promise<void> => {
    const request = browser.capture()
    showStatus(`Downloading ${key}…`)
    try {
        const picker = (
            window as Window & {
                showSaveFilePicker?: (options: {
                    suggestedName: string
                }) => Promise<{ createWritable: () => Promise<WritableStream<Uint8Array>> }>
            }
        ).showSaveFilePicker
        const name = key.split('/').at(-1) || key
        const handle = picker ? await picker({ suggestedName: name }) : undefined
        const file = await request.client.download(key, { as: 'stream' })
        if (handle) {
            await file.stream().pipeTo(await handle.createWritable())
            if (request.current()) showStatus(`Downloaded ${key}`)
            return
        }
        // ponytail: Browsers without streaming save use Blob only for small files; add a streamed endpoint if large downloads are needed there.
        if (file.size > 64 * 1024 * 1024)
            throw new Error('Large downloads require a browser with streaming file save support.')
        const url = URL.createObjectURL(await file.blob())
        const link = document.createElement('a')
        link.href = url
        link.download = name
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
        if (request.current()) showStatus(`Downloaded ${key}`)
    } catch (error) {
        if (!request.current()) return
        showStatus(error instanceof Error ? error.message : String(error), true)
    }
}

const deleteFile = async (key: string): Promise<void> => {
    const request = browser.capture()
    if (!window.confirm(`Delete ${key}? This cannot be undone.`)) return
    showStatus(`Deleting ${key}…`)
    try {
        await request.client.delete(key)
        if (!request.current()) return
        browser.reset()
        await loadFiles()
    } catch (error) {
        if (!request.current()) return
        const message = error instanceof Error ? error.message : String(error)
        showStatus(message, true)
        void reportFailure({ kind: 'delete', message, target: key }, request.current)
    }
}

const uploadFile = async (file: File): Promise<void> => {
    const request = browser.capture()
    const key = `${request.prefix}${file.name}`
    if (file.size > access.maxUploadSize) {
        const message = `${file.name} exceeds the ${formatBytes(access.maxUploadSize)} development upload limit.`
        showStatus(message, true)
        void reportFailure({ kind: 'upload', message, target: key }, request.current)
        return
    }
    const files = request.client
    try {
        if (!window.confirm(`Upload ${key}? This may replace an existing file.`)) return
        showStatus(`Uploading ${key}…`)
        await files.upload(key, file, { contentType: file.type || 'application/octet-stream' })
        if (!request.current()) return
        browser.reset()
        await loadFiles()
    } catch (error) {
        if (!request.current()) return
        const message = error instanceof Error ? error.message : String(error)
        showStatus(message, true)
        void reportFailure({ kind: 'upload', message, target: key }, request.current)
    }
}

const renderSnapshot = (): void => {
    summary.textContent = `${snapshot.storages.length} configured storage${snapshot.storages.length === 1 ? '' : 's'}`
    element('#storages', HTMLTableSectionElement).replaceChildren(
        ...snapshot.storages.map((item) => {
            const row = document.createElement('tr')
            for (const value of [item.name ?? 'Single storage', item.adapter, item.plugins.join(', ') || '—']) {
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
                const diagnosticTitle = document.createElement('strong')
                diagnosticTitle.textContent = `${item.code}: ${item.message}`
                message.append(diagnosticTitle)
                if (item.hint) message.append(document.createElement('br'), item.hint)
                if (item.docs) {
                    const link = document.createElement('a')
                    link.href = item.docs
                    link.target = '_blank'
                    link.rel = 'noreferrer'
                    link.textContent = 'Troubleshooting'
                    message.append(document.createElement('br'), link)
                }
                return message
            }),
        )
}

const initialize = async (): Promise<void> => {
    const id = ++initializationId
    initializationController?.abort()
    snapshotController?.abort()
    const controller = (initializationController = new AbortController())
    browser.reset(true)
    const request = browser.capture()
    try {
        const [snapshotResponse, accessResponse] = await Promise.all([
            fetchJson('./snapshot', controller.signal),
            fetchJson('./files?op=devtools', controller.signal),
        ])
        if (id !== initializationId || !request.current()) return
        if (!isSnapshot(snapshotResponse) || !isAccess(accessResponse)) {
            throw new Error('Files development tools returned an invalid response.')
        }
        snapshot = snapshotResponse
        access = accessResponse
        renderSnapshot()
        void publishDiagnostics()
        const previousStorage = browser.storage
        storageSelect.replaceChildren(
            ...snapshot.storages.map((item) => {
                const option = document.createElement('option')
                option.value = item.name ?? ''
                option.textContent = item.name ?? 'Single storage'
                return option
            }),
        )
        storageSelect.hidden = snapshot.storages.length < 2
        const selected = snapshot.storages.some(({ name }) => name === previousStorage)
            ? previousStorage
            : snapshot.storages[0]?.name
        browser.navigate(selected, selected === previousStorage ? browser.prefix : '')
        storageSelect.value = browser.storage ?? ''
        accessBadge.textContent = access.write ? 'Read & write' : 'Read only'
        accessBadge.className = `access-badge ${access.write ? 'write' : ''}`
        accessBadge.hidden = false
        uploadInput.disabled = !access.write
        uploadButton.hidden = !access.write
        if (snapshot.storages.length) await loadFiles()
        else showStatus('No configured storage.', true)
    } catch (error) {
        if (id !== initializationId || !request.current()) return
        summary.textContent = 'Unable to load Files development tools'
        const message = error instanceof Error ? error.message : String(error)
        showStatus(message, true)
        void reportFailure({ kind: 'gateway', message }, request.current)
    }
}

const copyDiagnostics = async (): Promise<void> => {
    try {
        const text = snapshot.diagnostics.length
            ? snapshot.diagnostics
                  .map((item) =>
                      [
                          `${item.code} [${item.level}]: ${item.message}`,
                          item.hint ? `Hint: ${item.hint}` : '',
                          item.docs ? `Docs: ${item.docs}` : '',
                      ]
                          .filter(Boolean)
                          .join('\n'),
                  )
                  .join('\n\n')
            : 'No integration diagnostics.'
        await navigator.clipboard.writeText(text)
        showStatus('Copied diagnostics.')
    } catch (error) {
        showStatus(error instanceof Error ? error.message : String(error), true)
    }
}

const initializeBridge = async (): Promise<void> => {
    if (new URL(window.location.href).searchParams.get('host') === 'nuxt-v3') return
    try {
        devframe = await connectDevframe({ simpleAuth: false })
        const rpc = devframe.scope('nuxt-files-sdk').rpc
        rpc.register({ name: 'refresh', type: 'event', handler: () => void initialize() })
        rpc.register({ name: 'copy-diagnostics', type: 'event', handler: () => void copyDiagnostics() })
    } catch {}
}

storageSelect.addEventListener('change', () => {
    initializationId++
    initializationController?.abort()
    snapshotController?.abort()
    browser.navigate(snapshot.storages[storageSelect.selectedIndex]?.name)
    void loadFiles()
})
previousButton.addEventListener('click', () => {
    browser.previous()
    void loadFiles()
})
nextButton.addEventListener('click', () => {
    browser.next()
    void loadFiles()
})
refreshButton.addEventListener('click', () => void initialize())
uploadInput.addEventListener('change', () => {
    const file = uploadInput.files?.[0]
    uploadInput.value = ''
    if (file) void uploadFile(file)
})

bridgeReady = initializeBridge()
void initialize()
