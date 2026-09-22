<script setup lang="ts">
import type { UseFilesReturn } from 'files-sdk/vue'
import { computed } from 'vue'

import { useFilesComponentProps } from '../runtime/component-props'
import { useFilesAppConfig } from '../runtime/context'
import { useFilesLocale } from '../runtime/locale'
import type { FilesClassValue, FilesColor, FilesSize, FilesUi, FilesVariant } from '../runtime/theme'
import { resolveFilesTheme } from '../runtime/theme'
import { filesThemes } from '../runtime/themes'
import FilesIcon from './FilesIcon.vue'

defineOptions({ name: 'FilesUploadProgress' })

interface Props {
    class?: FilesClassValue
    color?: FilesColor
    files: UseFilesReturn
    size?: FilesSize
    ui?: FilesUi
    variant?: FilesVariant
}

const rawProps = withDefaults(defineProps<Props>(), { color: 'primary', size: 'md', variant: 'outline' })
const props = useFilesComponentProps('filesUploadProgress', rawProps)
const appConfig = useFilesAppConfig()
const { dir, formatBytes } = useFilesLocale()
const theme = filesThemes.filesUploadProgress
const ui = computed(() => resolveFilesTheme(theme, appConfig.value.ui?.filesUploadProgress, props))
const uploads = computed(() => props.files.uploads.value)
const aggregate = computed(() => Math.round(props.files.progress.value.fraction * 100))
</script>

<template>
    <div v-if="uploads.length" :dir="dir" :class="ui.root({ class: [props.ui?.root, props.class] })" aria-live="polite">
        <div v-if="uploads.length > 1" :class="ui.row({ class: props.ui?.row })">
            <span>{{ uploads.length }} files</span>
            <span>{{ aggregate }}%</span>
        </div>
        <progress
            v-if="uploads.length > 1"
            :class="ui.progress({ class: props.ui?.progress })"
            :value="aggregate"
            max="100"
        />
        <div
            v-for="upload in uploads"
            :key="`${upload.name}:${upload.size}`"
            :class="ui.item({ class: props.ui?.item })"
        >
            <div :class="ui.row({ class: props.ui?.row })">
                <FilesIcon
                    :name="upload.status === 'error' ? 'error' : upload.status === 'success' ? 'success' : 'file'"
                />
                <span class="nfs-grow nfs-truncate">{{ upload.name }}</span>
                <span class="nfs-muted">{{ formatBytes(upload.loaded) }} / {{ formatBytes(upload.total) }}</span>
            </div>
            <progress :class="ui.progress({ class: props.ui?.progress })" :value="upload.progress" max="1" />
            <span v-if="upload.error" :class="ui.error({ class: props.ui?.error })">{{ upload.error.message }}</span>
        </div>
    </div>
</template>
