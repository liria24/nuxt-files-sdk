<script setup lang="ts">
import type { FilesClient, UploadOutcome } from 'files-sdk/client'
import { computed, ref } from 'vue'

import { useFilesComponentProps } from '../runtime/component-props'
import { useFilesAppConfig } from '../runtime/context'
import { useFilesLocale } from '../runtime/locale'
import type { FilesClassValue, FilesColor, FilesSize, FilesUi, FilesVariant } from '../runtime/theme'
import { resolveFilesTheme } from '../runtime/theme'
import { filesThemes } from '../runtime/themes'
import { asError } from '../runtime/utils'
import FilesIcon from './FilesIcon.vue'

defineOptions({ name: 'FilesDropzone' })

interface Props {
    accept?: string
    class?: FilesClassValue
    color?: FilesColor
    directory?: boolean
    files: FilesClient
    maxFiles?: number
    maxSize?: number
    prefix?: string
    size?: FilesSize
    ui?: FilesUi
    variant?: FilesVariant
}

interface Entry {
    isDirectory: boolean
    isFile: boolean
    name: string
    fullPath: string
}
interface FileEntry extends Entry {
    file: (success: (file: File) => void, error?: (error: DOMException) => void) => void
}
interface DirectoryEntry extends Entry {
    createReader: () => {
        readEntries: (success: (entries: Entry[]) => void, error?: (error: DOMException) => void) => void
    }
}

const rawProps = withDefaults(defineProps<Props>(), {
    color: 'primary',
    directory: false,
    prefix: '',
    size: 'md',
    variant: 'outline',
})
const props = useFilesComponentProps('filesDropzone', rawProps)
const emit = defineEmits<{ error: [error: Error]; uploaded: [files: UploadOutcome[]] }>()
const appConfig = useFilesAppConfig()
const { dir, formatBytes, t } = useFilesLocale()
const theme = filesThemes.filesDropzone
const ui = computed(() => resolveFilesTheme(theme, appConfig.value.ui?.filesDropzone, props))
const input = ref<HTMLInputElement>()
const dragging = ref(false)
const uploading = ref(false)
const error = ref<Error>()
const status = ref('')
const relativePaths = new WeakMap<File, string>()

const readDirectory = async (entry: DirectoryEntry): Promise<File[]> => {
    const reader = entry.createReader()
    const entries: Entry[] = []
    while (true) {
        // oxlint-disable-next-line no-await-in-loop -- the directory reader exposes the next batch only after the previous read completes
        const batch = await new Promise<Entry[]>((resolve, reject) => reader.readEntries(resolve, reject))
        if (!batch.length) break
        entries.push(...batch)
    }
    return (await Promise.all(entries.map(readEntry))).flat()
}

const readEntry = async (entry: Entry): Promise<File[]> => {
    if (entry.isDirectory) return readDirectory(entry as DirectoryEntry)
    const file = await new Promise<File>((resolve, reject) => (entry as FileEntry).file(resolve, reject))
    relativePaths.set(file, entry.fullPath.replace(/^\//, ''))
    return [file]
}

const accepts = (file: File) => {
    if (!props.accept) return true
    return props.accept.split(',').some((raw) => {
        const rule = raw.trim().toLowerCase()
        if (rule.startsWith('.')) return file.name.toLowerCase().endsWith(rule)
        if (rule.endsWith('/*')) return file.type.toLowerCase().startsWith(rule.slice(0, -1))
        return file.type.toLowerCase() === rule
    })
}

const upload = async (selected: File[]) => {
    error.value = undefined
    const maxFiles = props.maxFiles ?? (props.directory ? Number.POSITIVE_INFINITY : 1)
    try {
        if (selected.length > maxFiles) throw new Error(t('dropzone.invalidCount', { count: maxFiles }))
        const invalidType = selected.find((file) => !accepts(file))
        if (invalidType) throw new Error(t('dropzone.invalidType', { name: invalidType.name }))
        const invalidSize = props.maxSize && selected.find((file) => file.size > props.maxSize!)
        if (invalidSize)
            throw new Error(t('dropzone.invalidSize', { name: invalidSize.name, size: formatBytes(props.maxSize!) }))

        uploading.value = true
        const outcomes: UploadOutcome[] = []
        for (const file of selected) {
            const path = relativePaths.get(file) || file.webkitRelativePath || file.name
            // oxlint-disable-next-line no-await-in-loop -- dropzone uploads are deliberately sequential to preserve selection order
            const outcome = await props.files.upload(
                `${props.prefix}${path}`,
                file,
                file.type ? { contentType: file.type } : {},
            )
            outcomes.push(outcome)
        }
        status.value = t(selected.length === 1 ? 'dropzone.uploaded' : 'dropzone.uploadedMany', {
            count: selected.length,
            name: selected[0]?.name ?? '',
        })
        emit('uploaded', outcomes)
    } catch (cause) {
        const next = asError(cause)
        error.value = next
        emit('error', next)
    } finally {
        uploading.value = false
        if (input.value) input.value.value = ''
    }
}

const dropped = async (event: DragEvent) => {
    dragging.value = false
    const items = Array.from(event.dataTransfer?.items ?? [])
    const entries = items
        .map((item) => (item as DataTransferItem & { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.())
        .filter(Boolean) as Entry[]
    await upload(
        entries.length
            ? (await Promise.all(entries.map(readEntry))).flat()
            : Array.from(event.dataTransfer?.files ?? []),
    )
}

const selected = (event: Event) => upload(Array.from((event.target as HTMLInputElement).files ?? []))
</script>

<template>
    <div :dir="dir" :class="ui.root({ class: [props.ui?.root, props.class] })">
        <input
            ref="input"
            class="nfs-sr-only"
            type="file"
            :accept="accept"
            :multiple="directory || (maxFiles ?? 1) > 1"
            v-bind="directory ? { webkitdirectory: '' } : {}"
            @change="selected"
        />
        <button
            :class="ui.dropzone({ class: props.ui?.dropzone })"
            :data-drag-active="dragging"
            :disabled="uploading"
            type="button"
            @click="input?.click()"
            @dragenter.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @dragover.prevent
            @drop.prevent="dropped"
        >
            <slot name="content" :uploading="uploading">
                <FilesIcon
                    :class="uploading ? 'nfs-icon-lg nfs-spin' : 'nfs-icon-lg'"
                    :name="uploading ? 'loading' : 'upload'"
                />
                <p>
                    {{
                        t(
                            uploading
                                ? 'dropzone.uploading'
                                : directory
                                  ? 'dropzone.folderPrompt'
                                  : 'dropzone.filePrompt',
                        )
                    }}
                </p>
            </slot>
        </button>
        <slot v-if="error" name="error" :error="error"
            ><p :class="ui.error({ class: props.ui?.error })">{{ error.message }}</p></slot
        >
        <p v-else-if="status" :class="ui.status({ class: props.ui?.status })" aria-live="polite">{{ status }}</p>
    </div>
</template>
