<script setup lang="ts">
import type { StoredFile } from 'files-sdk'
import type { FilesClient } from 'files-sdk/client'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useFilesComponentProps } from '../runtime/component-props'
import { useFilesAppConfig } from '../runtime/context'
import { useFilesLocale } from '../runtime/locale'
import type { FilesClassValue, FilesUi } from '../runtime/theme'
import { resolveFilesTheme } from '../runtime/theme'
import { filesThemes } from '../runtime/themes'
import { asError, createLatestRequest, isStoredFile, proxyUrl } from '../runtime/utils'
import FilesIcon from './FilesIcon.vue'

defineOptions({ name: 'FilesPreview' })

interface Props {
    class?: FilesClassValue
    endpoint?: string
    file: StoredFile | string
    files: FilesClient
    ui?: FilesUi
}

const rawProps = withDefaults(defineProps<Props>(), {
    endpoint: '/api/files',
})
const props = useFilesComponentProps('filesPreview', rawProps)
const emit = defineEmits<{ error: [error: Error] }>()
const appConfig = useFilesAppConfig()
const { dir, formatBytes, t } = useFilesLocale()
const theme = filesThemes.filesPreview
const ui = computed(() => resolveFilesTheme(theme, appConfig.value.ui?.filesPreview))
const metadata = ref<StoredFile>()
const source = ref('')
const text = ref('')
const loading = ref(false)
const error = ref<Error>()
const requests = createLatestRequest()
let objectUrl = ''
const key = computed(() => (isStoredFile(props.file) ? props.file.key : props.file))
const kind = computed(() => {
    const type = metadata.value?.type ?? ''
    if (type.startsWith('image/')) return 'image'
    if (type === 'application/pdf') return 'pdf'
    if (type.startsWith('text/') || type.includes('json')) return 'text'
    return 'unknown'
})

const clearObjectUrl = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = ''
}

const load = async () => {
    const request = requests.next()
    clearObjectUrl()
    source.value = ''
    text.value = ''
    error.value = undefined
    loading.value = true
    try {
        const file = props.file
        const requestedKey = isStoredFile(file) ? file.key : file
        const nextMetadata = isStoredFile(file) ? file : await props.files.head(file, { signal: request.signal })
        if (!requests.current(request)) return
        metadata.value = nextMetadata
        if (kind.value === 'text') {
            const content = await (await props.files.download(requestedKey, { signal: request.signal })).text()
            if (requests.current(request)) text.value = content
        } else if (kind.value === 'pdf') {
            const downloaded = await props.files.download(requestedKey, { signal: request.signal })
            const blob = await downloaded.blob()
            if (!requests.current(request)) return
            objectUrl = URL.createObjectURL(blob)
            source.value = objectUrl
        } else if (kind.value === 'image') {
            const capabilities = await props.files.capabilities({ signal: request.signal })
            const nextSource = capabilities.signedUrl.supported
                ? await props.files.url(requestedKey, { expiresIn: 3600, signal: request.signal })
                : proxyUrl(props.endpoint, requestedKey)
            if (requests.current(request)) source.value = nextSource
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

onMounted(load)
watch(() => props.file, load)
onBeforeUnmount(() => {
    requests.abort()
    clearObjectUrl()
})
</script>

<template>
    <figure :dir="dir" :class="ui.root({ class: [props.ui?.root, props.class] })">
        <div :class="ui.body({ class: props.ui?.body })">
            <div v-if="loading" class="nfs-loading">
                <FilesIcon class="nfs-spin" name="loading" />{{ t('common.loading') }}
            </div>
            <slot v-else-if="error" name="error" :error="error"
                ><p :class="ui.error({ class: props.ui?.error })">{{ error.message }}</p></slot
            >
            <slot v-else name="preview" :file="metadata" :kind="kind" :source="source" :text="text">
                <img v-if="kind === 'image'" class="nfs-preview-media" :src="source" :alt="key" />
                <object v-else-if="kind === 'pdf'" class="nfs-preview-object" :data="source" type="application/pdf">
                    {{ t('common.noPreview') }}
                </object>
                <pre v-else-if="kind === 'text'" class="nfs-preview-text">{{ text }}</pre>
                <div v-else class="nfs-empty">
                    <FilesIcon class="nfs-icon-lg" name="file" />{{ t('common.noPreview') }}
                </div>
            </slot>
        </div>
        <figcaption v-if="metadata" :class="ui.caption({ class: props.ui?.caption })">
            <span class="nfs-truncate">{{ metadata.key }}</span>
            <span class="nfs-muted">
                · {{ formatBytes(metadata.size) }} · {{ metadata.type || t('common.unknownType') }}</span
            >
        </figcaption>
    </figure>
</template>
