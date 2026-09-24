<script setup lang="ts">
import type { FilesClient } from 'files-sdk/client'
import {
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogOverlay,
    DialogPortal,
    DialogRoot,
    DialogTitle,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuPortal,
    DropdownMenuRoot,
    DropdownMenuTrigger,
} from 'reka-ui'
import { computed, nextTick, ref } from 'vue'

import type { FilesIconName } from '../icons'
import { allFilesActions, type FilesAction } from '../runtime/actions'
import { useFilesComponentProps } from '../runtime/component-props'
import { useFilesAppConfig } from '../runtime/context'
import { useFilesUiContext } from '../runtime/context'
import type { FilesButtonOptions, FilesInputOptions, FilesMenuItemOptions } from '../runtime/control-options'
import { useFilesLocale } from '../runtime/locale'
import type { FilesClassValue, FilesUi } from '../runtime/theme'
import { resolveFilesTheme } from '../runtime/theme'
import { filesThemes } from '../runtime/themes'
import { asError, downloadFile, parentOf } from '../runtime/utils'
import FilesIcon from './FilesIcon.vue'

defineOptions({ name: 'FilesActions' })

type DialogAction = Exclude<FilesAction, 'download'>

interface Props {
    actions?: FilesAction[]
    cancel?: FilesButtonOptions
    class?: FilesClassValue
    confirm?: FilesButtonOptions
    fileKey: string
    files: FilesClient
    input?: FilesInputOptions
    items?: Partial<Record<FilesAction, FilesMenuItemOptions>>
    trigger?: FilesButtonOptions
    ui?: FilesUi
}

const rawProps = withDefaults(defineProps<Props>(), {
    actions: () => allFilesActions,
})
const props = useFilesComponentProps('filesActions', rawProps)
const emit = defineEmits<{
    changed: []
    error: [error: Error]
}>()
const appConfig = useFilesAppConfig()
const iconContext = useFilesUiContext()
const { dir, t } = useFilesLocale()
const theme = filesThemes.filesActions
const ui = computed(() => resolveFilesTheme(theme, appConfig.value.ui?.filesActions))
const root = ref<HTMLElement>()
const dialogOpen = ref(false)
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

const open = async (next: DialogAction) => {
    action.value = next
    value.value = next === 'rename' ? (props.fileKey.split('/').pop() ?? props.fileKey) : props.fileKey
    error.value = undefined
    await nextTick()
    dialogOpen.value = true
}

const submit = async () => {
    busy.value = true
    error.value = undefined
    try {
        if (action.value === 'delete') await props.files.delete(props.fileKey)
        if (action.value === 'copy') await props.files.copy(props.fileKey, value.value)
        if (action.value === 'move') await props.files.move(props.fileKey, value.value)
        if (action.value === 'rename') await props.files.move(props.fileKey, parentOf(props.fileKey) + value.value)
        dialogOpen.value = false
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
const select = (next: FilesAction) => {
    if (next === 'download') void download()
    else void open(next)
}
const menuLabels: Record<FilesAction, string> = {
    download: 'common.download',
    copy: 'actions.copy',
    rename: 'actions.rename',
    move: 'actions.move',
    delete: 'common.delete',
}
const menuIcons: Record<FilesAction, FilesIconName> = {
    download: 'download',
    copy: 'copy',
    rename: 'rename',
    move: 'move',
    delete: 'trash',
}
const restoreFocus = (event: Event) => {
    event.preventDefault()
    root.value?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus()
}
</script>

<template>
    <div ref="root" :dir="dir" :class="ui.root({ class: [props.ui?.root, props.class] })" @click.stop>
        <DropdownMenuRoot>
            <DropdownMenuTrigger as-child>
                <slot name="trigger"
                    ><FilesControlButton
                        :options="props.trigger"
                        :aria-label="t('common.actions')"
                        icon="ellipsis"
                        default-color="neutral"
                        default-variant="ghost"
                        :class="ui.trigger({ class: props.ui?.trigger })"
                /></slot>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
                <DropdownMenuContent :dir="dir" :side-offset="4" :class="ui.menu({ class: props.ui?.menu })">
                    <DropdownMenuItem
                        v-for="name in actions"
                        :key="name"
                        :disabled="Boolean(props.items?.[name]?.disabled)"
                        :class="['nfs-menu-item', props.items?.[name]?.class]"
                        @select="select(name)"
                    >
                        <component
                            :is="iconContext.icon"
                            v-if="props.items?.[name]?.icon"
                            class="nfs-icon"
                            :name="props.items[name]?.icon"
                        />
                        <FilesIcon v-else :name="menuIcons[name]" />{{
                            props.items?.[name]?.label ?? t(menuLabels[name])
                        }}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenuPortal>
        </DropdownMenuRoot>

        <DialogRoot v-model:open="dialogOpen" @update:open="error = undefined">
            <DialogPortal>
                <DialogOverlay class="nfs-dialog-overlay" />
                <DialogContent
                    :dir="dir"
                    :class="ui.dialog({ class: props.ui?.dialog })"
                    @close-auto-focus="restoreFocus"
                >
                    <form class="nfs-stack" @submit.prevent="submit">
                        <DialogTitle class="nfs-dialog-title">{{ t(labels[action]) }}</DialogTitle>
                        <DialogDescription class="sr-only">{{ fileKey }}</DialogDescription>
                        <label v-if="action !== 'delete'" class="nfs-stack">
                            <span>{{ action === 'rename' ? t('actions.newName') : t('actions.destination') }}</span>
                            <FilesControlInput v-model="value" :options="props.input" required />
                        </label>
                        <p v-else>{{ fileKey }}</p>
                        <p v-if="error" :class="ui.error({ class: props.ui?.error })">{{ error.message }}</p>
                        <div class="nfs-dialog-actions">
                            <DialogClose as-child
                                ><FilesControlButton
                                    :options="props.cancel"
                                    :label="t('common.cancel')"
                                    default-color="neutral"
                                    default-variant="outline"
                            /></DialogClose>
                            <FilesControlButton
                                :options="props.confirm"
                                :label="t('common.confirm')"
                                :default-color="action === 'delete' ? 'error' : 'primary'"
                                :loading="busy"
                                button-type="submit"
                            />
                        </div>
                    </form>
                </DialogContent>
            </DialogPortal>
        </DialogRoot>
    </div>
</template>
