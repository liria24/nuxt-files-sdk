<script setup lang="ts">
import { connectDevframe } from 'devframe/client'
import type { FilesClient, UploadBody, UploadCallOptions } from 'files-sdk/client'
import { createFilesClient } from 'files-sdk/client'
import { computed, markRaw, onMounted, ref } from 'vue'

import FilesBrowser from '../../ui/components/FilesBrowser.vue'
import FilesDropzone from '../../ui/components/FilesDropzone.vue'
import { isFilesDevtoolsDiagnostic, type FilesDevtoolsFailure } from '../diagnostics'
import type { FilesDevtoolsSnapshot } from '../snapshot'

interface Access {
    write: boolean
    maxUploadSize: number
}

interface AccessToken {
    token: string
    expiresAt: number
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object'
const isSnapshot = (value: unknown): value is FilesDevtoolsSnapshot =>
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
    value.diagnostics.every(isFilesDevtoolsDiagnostic)
const isAccess = (value: unknown): value is Access =>
    isRecord(value) && typeof value.write === 'boolean' && typeof value.maxUploadSize === 'number'
const isAccessToken = (value: unknown): value is AccessToken =>
    isRecord(value) && typeof value.token === 'string' && typeof value.expiresAt === 'number'

const snapshot = ref<FilesDevtoolsSnapshot>({ storages: [], diagnostics: [] })
const access = ref<Access>({ write: false, maxUploadSize: 0 })
const selectedStorage = ref<string>()
const browserRevision = ref(0)
const status = ref('Loading…')
const statusError = ref(false)
let initializationId = 0
let devframe: Awaited<ReturnType<typeof connectDevframe>> | undefined
let accessToken: AccessToken | undefined
let accessTokenRequest: Promise<AccessToken> | undefined
let bridgeReady: Promise<void>

const requestAccessToken = async (): Promise<AccessToken> => {
    if (new URL(window.location.href).searchParams.get('host') === 'nuxt-v3') {
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

const authorizationHeaders = async (): Promise<HeadersInit> => {
    if (!accessToken || accessToken.expiresAt - Date.now() <= 10_000) {
        accessTokenRequest ??= requestAccessToken().finally(() => (accessTokenRequest = undefined))
        accessToken = await accessTokenRequest
    }
    return { authorization: `Bearer ${accessToken.token}` }
}

const fetchJson = async (url: string): Promise<unknown> => {
    const response = await fetch(url, { headers: await authorizationHeaders() })
    if (!response.ok) throw new Error(`DevTools request failed (${response.status}).`)
    return response.json()
}

const createClient = (storage: string | undefined): FilesClient => {
    const files = createFilesClient({
        endpoint: storage === undefined ? './files' : `./files?storage=${encodeURIComponent(storage)}`,
        headers: authorizationHeaders,
    })
    return new Proxy(files, {
        get(target, property) {
            if (property === 'upload') {
                return async (key: string, body: UploadBody, options?: UploadCallOptions) => {
                    if ((await target.exists(key)) && !window.confirm(`Replace the existing file ${key}?`)) {
                        throw new DOMException('Upload cancelled.', 'AbortError')
                    }
                    return target.upload(key, body, options)
                }
            }
            const value = Reflect.get(target, property, target) as unknown
            return typeof value === 'function' ? value.bind(target) : value
        },
    })
}

const files = computed(() => markRaw(createClient(selectedStorage.value)))
const actions = computed(() => (access.value.write ? (['download', 'delete'] as const) : (['download'] as const)))
const summary = computed(
    () => `${snapshot.value.storages.length} configured storage${snapshot.value.storages.length === 1 ? '' : 's'}`,
)

const showStatus = (message: string, error = false) => {
    status.value = message
    statusError.value = error
}

const reportFailure = async (failure: FilesDevtoolsFailure, id = browserRevision.value) => {
    await bridgeReady
    if (id === browserRevision.value) devframe?.scope('nuxt-files-sdk').rpc.callEvent('report-failure', failure)
}

const publishDiagnostics = async (current: FilesDevtoolsSnapshot) => {
    await bridgeReady
    if (snapshot.value === current)
        devframe?.scope('nuxt-files-sdk').rpc.callEvent('report-diagnostics', current.diagnostics)
}

const reportError = (kind: FilesDevtoolsFailure['kind'], error: Error) => {
    showStatus(error.message, true)
    void reportFailure({
        kind,
        message: error.message,
        ...(selectedStorage.value ? { target: selectedStorage.value } : {}),
    })
}

const refreshBrowser = () => {
    browserRevision.value++
}

const initialize = async () => {
    const id = ++initializationId
    showStatus('Loading…')
    try {
        const [snapshotResponse, accessResponse] = await Promise.all([
            fetchJson('./snapshot'),
            fetchJson('./files?op=devtools'),
        ])
        if (id !== initializationId) return
        if (!isSnapshot(snapshotResponse) || !isAccess(accessResponse)) {
            throw new Error('Files development tools returned an invalid response.')
        }
        const previousStorage = selectedStorage.value
        snapshot.value = snapshotResponse
        access.value = accessResponse
        selectedStorage.value = snapshotResponse.storages.some(({ name }) => name === previousStorage)
            ? previousStorage
            : snapshotResponse.storages[0]?.name
        refreshBrowser()
        showStatus(
            snapshotResponse.storages.length ? 'Ready.' : 'No configured storage.',
            !snapshotResponse.storages.length,
        )
        void publishDiagnostics(snapshotResponse)
    } catch (cause) {
        if (id !== initializationId) return
        reportError('gateway', cause instanceof Error ? cause : new Error(String(cause)))
    }
}

const changeStorage = (event: Event) => {
    selectedStorage.value = (event.target as HTMLSelectElement).value || undefined
    refreshBrowser()
}

const copyDiagnostics = async () => {
    const text = snapshot.value.diagnostics.length
        ? snapshot.value.diagnostics
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
    try {
        await navigator.clipboard.writeText(text)
        showStatus('Copied diagnostics.')
    } catch (cause) {
        showStatus(cause instanceof Error ? cause.message : String(cause), true)
    }
}

const initializeBridge = async () => {
    if (new URL(window.location.href).searchParams.get('host') === 'nuxt-v3') return
    try {
        devframe = await connectDevframe({ simpleAuth: false })
        const rpc = devframe.scope('nuxt-files-sdk').rpc
        rpc.register({ name: 'refresh', type: 'event', handler: () => void initialize() })
        rpc.register({ name: 'copy-diagnostics', type: 'event', handler: () => void copyDiagnostics() })
    } catch {}
}

bridgeReady = initializeBridge()
onMounted(() => void initialize())
</script>

<template>
    <header class="page-header">
        <div>
            <h1>Files</h1>
            <p>{{ summary }}</p>
        </div>
    </header>
    <main class="content">
        <section class="panel" aria-labelledby="browser-heading">
            <header class="panel-header">
                <div>
                    <h2 id="browser-heading">File browser</h2>
                    <p>Browse and manage the selected development storage.</p>
                </div>
                <span :class="['access-badge', { write: access.write }]">
                    {{ access.write ? 'Read & write' : 'Read only' }}
                </span>
            </header>
            <FilesBrowser
                v-if="snapshot.storages.length"
                :key="browserRevision"
                :actions="[...actions]"
                :files="files"
                :thumbnails="false"
                @changed="showStatus('Files updated.')"
                @error="reportError('gateway', $event)"
            >
                <template #header="{ prefix, refresh }">
                    <div class="browser-header">
                        <select
                            v-if="snapshot.storages.length > 1"
                            :value="selectedStorage ?? ''"
                            aria-label="Storage"
                            @change="changeStorage"
                        >
                            <option
                                v-for="storage in snapshot.storages"
                                :key="storage.name ?? ''"
                                :value="storage.name ?? ''"
                            >
                                {{ storage.name ?? 'Single storage' }}
                            </option>
                        </select>
                        <button type="button" @click="initialize">Refresh</button>
                        <FilesDropzone
                            v-if="access.write"
                            :files="files"
                            :max-size="access.maxUploadSize"
                            :prefix="prefix"
                            :ui="{ dropzone: 'devtools-dropzone' }"
                            @error="reportError('upload', $event)"
                            @uploaded="refresh()"
                        >
                            <template #content="{ uploading }">{{ uploading ? 'Uploading…' : 'Upload' }}</template>
                        </FilesDropzone>
                    </div>
                </template>
            </FilesBrowser>
            <p v-else class="empty-state">No configured storage.</p>
            <p :class="['browser-status', { error: statusError }]" aria-live="polite">{{ status }}</p>
        </section>

        <section class="panel" aria-labelledby="storages-heading">
            <header class="panel-header"><h2 id="storages-heading">Storages</h2></header>
            <div class="table-scroll">
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Adapter</th>
                            <th>Plugins</th>
                            <th>Source</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="storage in snapshot.storages" :key="storage.name ?? ''">
                            <td>{{ storage.name ?? 'Single storage' }}</td>
                            <td>{{ storage.adapter }}</td>
                            <td>{{ storage.plugins.join(', ') || '—' }}</td>
                            <td>{{ storage.source }}</td>
                            <td>
                                <span :class="['status', storage.initialized ? 'success' : 'idle']">{{
                                    storage.initialized ? 'Initialized' : 'Not initialized'
                                }}</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>

        <section class="panel" aria-labelledby="diagnostics-heading">
            <header class="panel-header"><h2 id="diagnostics-heading">Diagnostics</h2></header>
            <div class="diagnostics">
                <p v-if="!snapshot.diagnostics.length" class="empty-state">No integration diagnostics.</p>
                <p v-for="diagnostic in snapshot.diagnostics" v-else :key="diagnostic.code" :class="diagnostic.level">
                    <strong>{{ diagnostic.code }}: {{ diagnostic.message }}</strong
                    ><br v-if="diagnostic.hint" />{{ diagnostic.hint }}
                    <template v-if="diagnostic.docs"
                        ><br /><a :href="diagnostic.docs" target="_blank" rel="noreferrer">Troubleshooting</a></template
                    >
                </p>
            </div>
        </section>
    </main>
</template>
