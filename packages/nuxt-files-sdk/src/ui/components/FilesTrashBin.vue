<script setup lang="ts">
import type { FilesClient } from 'files-sdk/client'
import { computed, onMounted, ref } from 'vue'

import { useFilesComponentProps } from '../runtime/component-props'
import { useFilesAppConfig } from '../runtime/context'
import { useFilesLocale } from '../runtime/locale'
import type { FilesClassValue, FilesColor, FilesSize, FilesUi, FilesVariant } from '../runtime/theme'
import { resolveFilesTheme } from '../runtime/theme'
import { filesThemes } from '../runtime/themes'
import { asError } from '../runtime/utils'
import FilesIcon from './FilesIcon.vue'

defineOptions({ name: 'FilesTrashBin' })

type TrashedFile = Awaited<ReturnType<FilesClient['trashed']>>[number]

interface Props {
    class?: FilesClassValue
    color?: FilesColor
    files: FilesClient
    size?: FilesSize
    ui?: FilesUi
    variant?: FilesVariant
}

const rawProps = withDefaults(defineProps<Props>(), { color: 'primary', size: 'md', variant: 'outline' })
const props = useFilesComponentProps('filesTrashBin', rawProps)
const emit = defineEmits<{ changed: []; error: [error: Error]; restored: [file: TrashedFile] }>()
const appConfig = useFilesAppConfig()
const { dir, formatBytes, formatDate, t } = useFilesLocale()
const theme = filesThemes.filesTrashBin
const ui = computed(() => resolveFilesTheme(theme, appConfig.value.ui?.filesTrashBin, props))
const items = ref<TrashedFile[]>([])
const loading = ref(false)
const error = ref<Error>()

const load = async () => {
    loading.value = true
    error.value = undefined
    try {
        items.value = await props.files.trashed()
    } catch (cause) {
        const next = asError(cause)
        error.value = next
        emit('error', next)
    } finally {
        loading.value = false
    }
}
const change = async (operation: () => Promise<unknown>, restored?: TrashedFile) => {
    try {
        await operation()
        if (restored) emit('restored', restored)
        emit('changed')
        await load()
    } catch (cause) {
        const next = asError(cause)
        error.value = next
        emit('error', next)
    }
}
const purge = (file?: TrashedFile) => {
    const message = file ? t('trash.itemConfirm', { key: file.key }) : t('trash.emptyConfirm')
    if (window.confirm(message)) void change(() => props.files.purge(file?.key))
}

onMounted(load)
defineExpose({ refresh: load })
</script>

<template>
    <div :dir="dir" :class="ui.root({ class: [props.ui?.root, props.class] })">
        <div class="nfs-row nfs-between">
            <span class="nfs-muted">{{ t('trash.summary', { count: items.length }) }}</span>
            <button v-if="items.length" class="nfs-button nfs-button-danger" type="button" @click="purge()">
                <FilesIcon name="trash" />{{ t('trash.emptyAction') }}
            </button>
        </div>
        <p v-if="error" :class="ui.error({ class: props.ui?.error })">{{ error.message }}</p>
        <div v-else-if="loading && !items.length" class="nfs-loading">
            <FilesIcon class="nfs-spin" name="loading" />{{ t('common.loading') }}
        </div>
        <slot v-else-if="!items.length" name="empty"
            ><div :class="ui.empty({ class: props.ui?.empty })">
                <FilesIcon name="trash" />{{ t('trash.empty') }}
            </div></slot
        >
        <ul v-else :class="ui.list({ class: props.ui?.list })">
            <li v-for="file in items" :key="file.key" :class="ui.item({ class: props.ui?.item })">
                <FilesIcon name="file" />
                <span class="nfs-file-info">
                    <span class="nfs-truncate">{{ file.key }}</span>
                    <span class="nfs-muted"
                        >{{ formatBytes(file.size)
                        }}<template v-if="file.lastModified"> · {{ formatDate(file.lastModified) }}</template></span
                    >
                </span>
                <div class="nfs-row ms-auto">
                    <button
                        class="nfs-button"
                        type="button"
                        @click="change(() => files.restoreTrashed(file.key), file)"
                    >
                        <FilesIcon name="restore" />{{ t('trash.restore') }}
                    </button>
                    <button
                        class="nfs-icon-button"
                        type="button"
                        :aria-label="t('trash.deleteForever')"
                        @click="purge(file)"
                    >
                        <FilesIcon name="trash" />
                    </button>
                </div>
            </li>
        </ul>
    </div>
</template>
