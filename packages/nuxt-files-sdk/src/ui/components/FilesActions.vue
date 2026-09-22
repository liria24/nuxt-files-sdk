<script setup lang="ts">
import type { FilesClient } from 'files-sdk/client'
import { computed, ref } from 'vue'

import { allFilesActions, type FilesAction } from '../runtime/actions'
import { useFilesComponentProps } from '../runtime/component-props'
import { useFilesAppConfig } from '../runtime/context'
import { useFilesLocale } from '../runtime/locale'
import type { FilesClassValue, FilesColor, FilesSize, FilesUi, FilesVariant } from '../runtime/theme'
import { resolveFilesTheme } from '../runtime/theme'
import { filesThemes } from '../runtime/themes'
import { asError, downloadFile, parentOf } from '../runtime/utils'
import FilesIcon from './FilesIcon.vue'

defineOptions({ name: 'FilesActions' })

type DialogAction = Exclude<FilesAction, 'download'>

interface Props {
    actions?: FilesAction[]
    class?: FilesClassValue
    color?: FilesColor
    fileKey: string
    files: FilesClient
    size?: FilesSize
    ui?: FilesUi
    variant?: FilesVariant
}

const rawProps = withDefaults(defineProps<Props>(), {
    actions: () => allFilesActions,
    color: 'primary',
    size: 'md',
    variant: 'ghost',
})
const props = useFilesComponentProps('filesActions', rawProps)
const emit = defineEmits<{
    changed: []
    error: [error: Error]
}>()
const appConfig = useFilesAppConfig()
const { dir, t } = useFilesLocale()
const theme = filesThemes.filesActions
const ui = computed(() => resolveFilesTheme(theme, appConfig.value.ui?.filesActions, props))
const dialog = ref<HTMLDialogElement>()
const action = ref<DialogAction>('rename')
const value = ref('')
const busy = ref(false)
const error = ref<Error>()
const labels: Record<DialogAction, string> = {
    copy: 'actions.copyTo',
    delete: 'actions.deleteFile',
    move: 'actions.moveTo',
    rename: 'actions.renameFile',
}

const open = (next: DialogAction) => {
    action.value = next
    value.value = next === 'rename' ? (props.fileKey.split('/').pop() ?? props.fileKey) : props.fileKey
    error.value = undefined
    dialog.value?.showModal()
}

const submit = async () => {
    busy.value = true
    error.value = undefined
    try {
        if (action.value === 'delete') await props.files.delete(props.fileKey)
        if (action.value === 'copy') await props.files.copy(props.fileKey, value.value)
        if (action.value === 'move') await props.files.move(props.fileKey, value.value)
        if (action.value === 'rename') await props.files.move(props.fileKey, parentOf(props.fileKey) + value.value)
        dialog.value?.close()
        emit('changed')
    } catch (cause) {
        const next = asError(cause)
        error.value = next
        emit('error', next)
    } finally {
        busy.value = false
    }
}

const download = async () => {
    try {
        await downloadFile(props.files, props.fileKey)
    } catch (cause) {
        emit('error', asError(cause))
    }
}
</script>

<template>
    <div :dir="dir" :class="ui.root({ class: [props.ui?.root, props.class] })" @click.stop>
        <details class="nfs-details">
            <summary :class="ui.trigger({ class: props.ui?.trigger })" :aria-label="t('common.actions')">
                <slot name="trigger"><FilesIcon name="ellipsis" /></slot>
            </summary>
            <div :class="ui.menu({ class: props.ui?.menu })">
                <button v-if="actions.includes('download')" type="button" @click="download">
                    <FilesIcon name="download" />{{ t('common.download') }}
                </button>
                <button v-if="actions.includes('copy')" type="button" @click="open('copy')">
                    <FilesIcon name="copy" />{{ t('actions.copy') }}
                </button>
                <button v-if="actions.includes('rename')" type="button" @click="open('rename')">
                    <FilesIcon name="rename" />{{ t('actions.rename') }}
                </button>
                <button v-if="actions.includes('move')" type="button" @click="open('move')">
                    <FilesIcon name="move" />{{ t('actions.move') }}
                </button>
                <button v-if="actions.includes('delete')" type="button" @click="open('delete')">
                    <FilesIcon name="trash" />{{ t('common.delete') }}
                </button>
            </div>
        </details>

        <dialog ref="dialog" :class="ui.dialog({ class: props.ui?.dialog })" @close="error = undefined">
            <form method="dialog" class="nfs-stack" @submit.prevent="submit">
                <h2 class="nfs-dialog-title">{{ t(labels[action]) }}</h2>
                <label v-if="action !== 'delete'" class="nfs-stack">
                    <span>{{ action === 'rename' ? t('actions.newName') : t('actions.destination') }}</span>
                    <input v-model="value" class="nfs-input" required />
                </label>
                <p v-else>{{ fileKey }}</p>
                <p v-if="error" :class="ui.error({ class: props.ui?.error })">{{ error.message }}</p>
                <div class="nfs-dialog-actions">
                    <button class="nfs-button" type="button" @click="dialog?.close()">{{ t('common.cancel') }}</button>
                    <button
                        :class="['nfs-button', action === 'delete' ? 'nfs-button-danger' : 'nfs-button-primary']"
                        :disabled="busy"
                        type="submit"
                    >
                        {{ t('common.confirm') }}
                    </button>
                </div>
            </form>
        </dialog>
    </div>
</template>
