<script setup lang="ts">
import type { StoredFile } from 'files-sdk'
import type { FilesClient } from 'files-sdk/client'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { allFilesActions, type FilesAction } from '../runtime/actions'
import { useFilesComponentProps } from '../runtime/component-props'
import { useFilesAppConfig } from '../runtime/context'
import { useFilesLocale } from '../runtime/locale'
import type { FilesClassValue, FilesColor, FilesSize, FilesUi, FilesVariant } from '../runtime/theme'
import { resolveFilesTheme } from '../runtime/theme'
import { filesThemes } from '../runtime/themes'
import { asError, createLatestRequest, proxyUrl } from '../runtime/utils'
import FilesActions from './FilesActions.vue'
import FilesIcon from './FilesIcon.vue'

defineOptions({ name: 'FilesBrowser' })

interface Props {
    actions?: FilesAction[]
    class?: FilesClassValue
    color?: FilesColor
    delimiter?: string
    endpoint?: string
    files: FilesClient
    initialPrefix?: string
    readOnly?: boolean
    selected?: StoredFile
    size?: FilesSize
    thumbnails?: boolean
    ui?: FilesUi
    variant?: FilesVariant
}

const rawProps = withDefaults(defineProps<Props>(), {
    actions: () => allFilesActions,
    color: 'primary',
    delimiter: '/',
    endpoint: '/api/files',
    initialPrefix: '',
    readOnly: false,
    size: 'md',
    thumbnails: true,
    variant: 'outline',
})
const props = useFilesComponentProps('filesBrowser', rawProps)
const emit = defineEmits<{
    changed: []
    error: [error: Error]
    select: [file: StoredFile]
    'update:selected': [file: StoredFile | undefined]
}>()
const appConfig = useFilesAppConfig()
const { dir, formatBytes, formatDate, t } = useFilesLocale()
const theme = filesThemes.filesBrowser
const ui = computed(() => resolveFilesTheme(theme, appConfig.value.ui?.filesBrowser, props))
const prefix = ref(props.initialPrefix)
const items = ref<StoredFile[]>([])
const prefixes = ref<string[]>([])
const thumbnails = ref<Record<string, string>>({})
const cursor = ref<string>()
const loading = ref(false)
const error = ref<Error>()
const mounted = ref(false)
const requests = createLatestRequest()
const breadcrumbs = computed(() => {
    const parts = prefix.value.split(props.delimiter).filter(Boolean)
    return parts.map((label, index) => ({
        label,
        prefix: `${parts.slice(0, index + 1).join(props.delimiter)}${props.delimiter}`,
    }))
})

const load = async (append = false) => {
    const request = requests.next()
    loading.value = true
    error.value = undefined
    try {
        const result = await props.files.list({
            prefix: prefix.value,
            delimiter: props.delimiter,
            ...(append && cursor.value !== undefined && { cursor: cursor.value }),
            signal: request.signal,
        })
        if (!requests.current(request)) return
        items.value = append ? [...items.value, ...result.items] : result.items
        prefixes.value = append ? [...prefixes.value, ...(result.prefixes ?? [])] : (result.prefixes ?? [])
        cursor.value = result.cursor
        if (props.thumbnails) {
            const capabilities = await props.files.capabilities({ signal: request.signal })
            await Promise.all(
                result.items
                    .filter((item) => item.type.startsWith('image/'))
                    .map(async (file) => {
                        thumbnails.value[file.key] = capabilities.signedUrl.supported
                            ? await props.files.url(file.key, { expiresIn: 3600, signal: request.signal })
                            : proxyUrl(props.endpoint, file.key)
                    }),
            )
        }
    } catch (cause) {
        if (!requests.current(request)) return
        const next = asError(cause)
        error.value = next
        emit('error', next)
    } finally {
        if (requests.current(request)) loading.value = false
    }
}

const enter = (next: string) => {
    prefix.value = next
    emit('update:selected', undefined)
}
const select = (file: StoredFile) => {
    emit('update:selected', file)
    emit('select', file)
}
const changed = async () => {
    await load()
    emit('changed')
}

onMounted(() => {
    mounted.value = true
    load()
})
onBeforeUnmount(requests.abort)
watch(prefix, () => mounted.value && load())
defineExpose({ refresh: () => load() })
</script>

<template>
    <div :dir="dir" :class="ui.root({ class: [props.ui?.root, props.class] })">
        <slot name="header" :prefix="prefix" :refresh="load" />
        <nav :class="ui.breadcrumb({ class: props.ui?.breadcrumb })" aria-label="Breadcrumb">
            <button class="nfs-icon-button" type="button" :aria-label="t('browser.root')" @click="enter('')">
                <FilesIcon name="home" />
            </button>
            <template v-for="crumb in breadcrumbs" :key="crumb.prefix">
                <FilesIcon name="chevronRight" />
                <button class="nfs-button" type="button" @click="enter(crumb.prefix)">{{ crumb.label }}</button>
            </template>
            <button
                class="nfs-icon-button"
                type="button"
                :aria-label="t('list.refresh')"
                :disabled="loading"
                @click="load()"
            >
                <FilesIcon :class="loading ? 'nfs-spin' : undefined" name="refresh" />
            </button>
        </nav>
        <p v-if="error" :class="ui.error({ class: props.ui?.error })">{{ error.message }}</p>
        <div v-else-if="loading && !items.length && !prefixes.length" class="nfs-loading">
            <FilesIcon class="nfs-spin" name="loading" />{{ t('common.loading') }}
        </div>
        <slot v-else-if="!items.length && !prefixes.length" name="empty">
            <div :class="ui.empty({ class: props.ui?.empty })">
                <FilesIcon class="nfs-icon-lg" name="folderOpen" />{{ t('browser.empty') }}
            </div>
        </slot>
        <slot v-else name="content" :items="items" :prefixes="prefixes" :prefix="prefix">
            <ul :class="ui.list({ class: props.ui?.list })">
                <li v-for="folder in prefixes" :key="folder" :class="ui.item({ class: props.ui?.item })">
                    <button class="nfs-clickable" type="button" @click="enter(folder)">
                        <span class="nfs-tile"><FilesIcon name="folder" /></span>
                        <span class="nfs-grow nfs-truncate">{{
                            folder.slice(prefix.length).replace(delimiter, '')
                        }}</span>
                        <FilesIcon name="chevronRight" />
                    </button>
                </li>
                <li
                    v-for="file in items"
                    :key="file.key"
                    :class="[ui.item({ class: props.ui?.item }), { 'nfs-selected': selected?.key === file.key }]"
                >
                    <button
                        class="nfs-clickable"
                        type="button"
                        :aria-pressed="selected?.key === file.key"
                        @click="select(file)"
                    >
                        <img v-if="thumbnails[file.key]" class="nfs-thumbnail" :src="thumbnails[file.key]" alt="" />
                        <span v-else class="nfs-tile"><FilesIcon name="file" /></span>
                        <span class="nfs-file-info">
                            <span class="nfs-truncate">{{ file.key.slice(prefix.length) }}</span>
                            <span class="nfs-muted"
                                >{{ formatBytes(file.size)
                                }}<template v-if="file.lastModified">
                                    · {{ formatDate(file.lastModified) }}</template
                                ></span
                            >
                        </span>
                    </button>
                    <FilesActions
                        v-if="!readOnly && actions.length"
                        :actions="actions"
                        :size="props.size"
                        :color="props.color"
                        :ui="{ menu: 'start-auto end-0' }"
                        :file-key="file.key"
                        :files="files"
                        @changed="changed"
                        @error="emit('error', $event)"
                    />
                </li>
            </ul>
        </slot>
        <button v-if="cursor" class="nfs-button" type="button" :disabled="loading" @click="load(true)">
            {{ t('browser.loadMore') }}
        </button>
    </div>
</template>
