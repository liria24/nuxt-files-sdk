<script setup lang="ts">
import type { UploadOutcome } from 'files-sdk/vue'
import type { UseFilesReturn } from 'files-sdk/vue'
import { computed, ref } from 'vue'

import { useFilesComponentProps } from '../runtime/component-props'
import { useFilesAppConfig } from '../runtime/context'
import { useFilesLocale } from '../runtime/locale'
import type { FilesClassValue, FilesColor, FilesSize, FilesUi, FilesVariant } from '../runtime/theme'
import { resolveFilesTheme } from '../runtime/theme'
import { filesThemes } from '../runtime/themes'
import { asError } from '../runtime/utils'
import FilesIcon from './FilesIcon.vue'

defineOptions({ name: 'FilesMultipartUploader' })

interface Props {
    accept?: string
    class?: FilesClassValue
    color?: FilesColor
    concurrency?: number
    files: UseFilesReturn
    modelValue?: File[]
    prefix?: string
    size?: FilesSize
    ui?: FilesUi
    variant?: FilesVariant
}

type State = 'cancelled' | 'error' | 'pending' | 'success' | 'uploading'

const rawProps = withDefaults(defineProps<Props>(), {
    color: 'primary',
    concurrency: 3,
    modelValue: () => [],
    prefix: '',
    size: 'md',
    variant: 'outline',
})
const props = useFilesComponentProps('filesMultipartUploader', rawProps)
const emit = defineEmits<{
    error: [error: Error]
    'update:modelValue': [files: File[]]
    uploaded: [files: UploadOutcome[]]
}>()
const appConfig = useFilesAppConfig()
const { dir, formatBytes, t } = useFilesLocale()
const theme = filesThemes.filesMultipartUploader
const ui = computed(() => resolveFilesTheme(theme, appConfig.value.ui?.filesMultipartUploader, props))
const states = ref<State[]>([])
const errors = ref<Record<number, Error>>({})
const running = ref(false)

const choose = (event: Event) => {
    const files = Array.from((event.target as HTMLInputElement).files ?? [])
    emit('update:modelValue', files)
    states.value = files.map(() => 'pending')
    errors.value = {}
}

const start = async () => {
    if (!props.modelValue.length) return
    props.files.reset()
    running.value = true
    states.value = props.modelValue.map(() => 'pending')
    errors.value = {}
    const outcomes: UploadOutcome[] = []
    let next = 0
    const worker = async () => {
        while (running.value) {
            const index = next++
            const file = props.modelValue[index]
            if (!file) return
            states.value[index] = 'uploading'
            try {
                const key = `${props.prefix}${file.webkitRelativePath || file.name}`
                // oxlint-disable-next-line no-await-in-loop -- each worker is sequential; worker count provides the configured concurrency bound
                outcomes.push(await props.files.upload(key, file, file.type ? { contentType: file.type } : {}))
                states.value[index] = 'success'
            } catch (cause) {
                const error = asError(cause)
                errors.value[index] = error
                states.value[index] = running.value ? 'error' : 'cancelled'
                emit('error', error)
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(props.concurrency, props.modelValue.length) }, worker))
    const completed = running.value
    running.value = false
    if (completed) emit('uploaded', outcomes)
}

const cancel = () => {
    running.value = false
    props.files.abort(new DOMException(t('multipart.cancelled'), 'AbortError'))
    states.value = states.value.map((state) => (state === 'pending' || state === 'uploading' ? 'cancelled' : state))
}
</script>

<template>
    <div :dir="dir" :class="ui.root({ class: [props.ui?.root, props.class] })">
        <label class="nfs-button">
            <FilesIcon name="upload" />{{ t('multipart.addFiles') }}
            <input class="nfs-sr-only" type="file" :accept="accept" multiple @change="choose" />
        </label>
        <p class="nfs-muted">{{ t('multipart.automaticParts') }}</p>
        <ul v-if="modelValue.length" :class="ui.list({ class: props.ui?.list })">
            <li
                v-for="(file, index) in modelValue"
                :key="`${file.name}:${file.size}`"
                :class="ui.item({ class: props.ui?.item })"
            >
                <FilesIcon
                    :name="states[index] === 'success' ? 'success' : states[index] === 'error' ? 'error' : 'file'"
                />
                <span class="nfs-file-info">
                    <span class="nfs-truncate">{{ file.name }}</span>
                    <span class="nfs-muted">{{ formatBytes(file.size) }} · {{ states[index] ?? 'pending' }}</span>
                    <span v-if="errors[index]" :class="ui.error({ class: props.ui?.error })">{{
                        errors[index].message
                    }}</span>
                </span>
            </li>
        </ul>
        <div class="nfs-row">
            <button
                v-if="!running"
                class="nfs-button nfs-button-primary"
                type="button"
                :disabled="!modelValue.length"
                @click="start"
            >
                {{ t('multipart.upload', { count: modelValue.length }) }}
            </button>
            <button v-else class="nfs-button" type="button" @click="cancel">{{ t('multipart.cancel') }}</button>
        </div>
    </div>
</template>
