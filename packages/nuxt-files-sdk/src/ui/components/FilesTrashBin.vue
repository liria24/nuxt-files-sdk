<script setup lang="ts">
import type { FilesClient } from 'files-sdk/client'
import {
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogOverlay,
    AlertDialogPortal,
    AlertDialogRoot,
    AlertDialogTitle,
    AlertDialogTrigger,
} from 'reka-ui'
import { computed, onMounted, ref } from 'vue'

import { useFilesComponentProps } from '../runtime/component-props'
import { useFilesAppConfig } from '../runtime/context'
import type { FilesButtonOptions } from '../runtime/control-options'
import { useFilesLocale } from '../runtime/locale'
import type { FilesClassValue, FilesUi } from '../runtime/theme'
import { resolveFilesTheme } from '../runtime/theme'
import { filesThemes } from '../runtime/themes'
import { asError } from '../runtime/utils'
import FilesIcon from './FilesIcon.vue'

defineOptions({ name: 'FilesTrashBin' })

type TrashedFile = Awaited<ReturnType<FilesClient['trashed']>>[number]

interface Props {
    cancel?: FilesButtonOptions
    class?: FilesClassValue
    confirm?: FilesButtonOptions
    files: FilesClient
    purge?: FilesButtonOptions
    purgeAll?: FilesButtonOptions
    restore?: FilesButtonOptions
    ui?: FilesUi
}

const rawProps = defineProps<Props>()
const props = useFilesComponentProps('filesTrashBin', rawProps)
const emit = defineEmits<{ changed: []; error: [error: Error]; restored: [file: TrashedFile] }>()
const appConfig = useFilesAppConfig()
const { dir, formatBytes, formatDate, t } = useFilesLocale()
const theme = filesThemes.filesTrashBin
const ui = computed(() => resolveFilesTheme(theme, appConfig.value.ui?.filesTrashBin))
const items = ref<TrashedFile[]>([])
const loading = ref(false)
const error = ref<Error>()
const confirmOpen = ref(false)
const pendingPurge = ref<TrashedFile | null>(null)
const purgeBusy = ref(false)
const purgeTrigger = ref<HTMLElement>()

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
        return true
    } catch (cause) {
        const next = asError(cause)
        error.value = next
        emit('error', next)
        return false
    }
}
const purge = async () => {
    purgeBusy.value = true
    if (await change(() => props.files.purge(pendingPurge.value?.key))) confirmOpen.value = false
    purgeBusy.value = false
}
const preparePurge = (file: TrashedFile | null, event: MouseEvent) => {
    pendingPurge.value = file
    purgeTrigger.value = event.currentTarget as HTMLElement
}
const restorePurgeFocus = (event: Event) => {
    event.preventDefault()
    purgeTrigger.value?.focus()
}

onMounted(load)
defineExpose({ refresh: load })
</script>

<template>
    <AlertDialogRoot v-model:open="confirmOpen">
        <div :dir="dir" :class="ui.root({ class: [props.ui?.root, props.class] })">
            <div class="nfs-row nfs-between">
                <span class="nfs-muted">{{ t('trash.summary', { count: items.length }) }}</span>
                <AlertDialogTrigger v-if="items.length" as-child
                    ><FilesControlButton
                        :options="props.purgeAll"
                        :label="t('trash.emptyAction')"
                        icon="trash"
                        default-color="error"
                        @click="preparePurge(null, $event)"
                /></AlertDialogTrigger>
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
                        <FilesControlButton
                            :options="props.restore"
                            :label="t('trash.restore')"
                            icon="restore"
                            default-color="neutral"
                            default-variant="outline"
                            @click="change(() => files.restoreTrashed(file.key), file)"
                        />
                        <AlertDialogTrigger as-child
                            ><FilesControlButton
                                :options="props.purge"
                                :aria-label="t('trash.deleteForever')"
                                icon="trash"
                                default-color="error"
                                default-variant="ghost"
                                @click="preparePurge(file, $event)"
                        /></AlertDialogTrigger>
                    </div>
                </li>
            </ul>
        </div>
        <AlertDialogPortal>
            <AlertDialogOverlay class="nfs-dialog-overlay" />
            <AlertDialogContent
                :dir="dir"
                :class="ui.dialog({ class: props.ui?.dialog })"
                @close-auto-focus="restorePurgeFocus"
            >
                <AlertDialogTitle class="nfs-dialog-title">{{ t('trash.deleteForever') }}</AlertDialogTitle>
                <AlertDialogDescription>{{
                    pendingPurge ? t('trash.itemConfirm', { key: pendingPurge.key }) : t('trash.emptyConfirm')
                }}</AlertDialogDescription>
                <p v-if="error" :class="ui.error({ class: props.ui?.error })">{{ error.message }}</p>
                <div class="nfs-dialog-actions">
                    <AlertDialogCancel as-child
                        ><FilesControlButton
                            :options="props.cancel"
                            :label="t('common.cancel')"
                            default-color="neutral"
                            default-variant="outline"
                    /></AlertDialogCancel>
                    <FilesControlButton
                        :options="props.confirm"
                        :label="t('common.confirm')"
                        default-color="error"
                        :loading="purgeBusy"
                        @click="purge"
                    />
                </div>
            </AlertDialogContent>
        </AlertDialogPortal>
    </AlertDialogRoot>
</template>
