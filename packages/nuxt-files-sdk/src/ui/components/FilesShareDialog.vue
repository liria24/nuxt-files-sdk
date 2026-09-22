<script setup lang="ts">
import type { AdapterCapabilities } from 'files-sdk'
import type { FilesClient } from 'files-sdk/client'
import { computed, ref } from 'vue'

import { useFilesComponentProps } from '../runtime/component-props'
import { useFilesAppConfig } from '../runtime/context'
import { useFilesLocale } from '../runtime/locale'
import type { FilesClassValue, FilesColor, FilesSize, FilesUi, FilesVariant } from '../runtime/theme'
import { resolveFilesTheme } from '../runtime/theme'
import { filesThemes } from '../runtime/themes'
import { asError } from '../runtime/utils'
import FilesIcon from './FilesIcon.vue'

defineOptions({ name: 'FilesShareDialog' })

interface Props {
    class?: FilesClassValue
    color?: FilesColor
    defaultExpiresIn?: number
    fileKey: string
    files: FilesClient
    mode?: 'download' | 'upload'
    size?: FilesSize
    ui?: FilesUi
    variant?: FilesVariant
}

const rawProps = withDefaults(defineProps<Props>(), {
    color: 'primary',
    defaultExpiresIn: 3600,
    mode: 'download',
    size: 'md',
    variant: 'outline',
})
const props = useFilesComponentProps('filesShareDialog', rawProps)
const emit = defineEmits<{ error: [error: Error]; generated: [url: string] }>()
const appConfig = useFilesAppConfig()
const { dir, t } = useFilesLocale()
const theme = filesThemes.filesShareDialog
const ui = computed(() => resolveFilesTheme(theme, appConfig.value.ui?.filesShareDialog, props))
const dialog = ref<HTMLDialogElement>()
const capabilities = ref<AdapterCapabilities>()
const expiresIn = ref(props.defaultExpiresIn)
const disposition = ref<'attachment' | 'inline'>('attachment')
const url = ref('')
const copied = ref(false)
const busy = ref(false)
const error = ref<Error>()

const open = async () => {
    url.value = ''
    copied.value = false
    error.value = undefined
    dialog.value?.showModal()
    try {
        capabilities.value = await props.files.capabilities()
        const max = capabilities.value.signedUrl.maxExpiresIn
        if (max) expiresIn.value = Math.min(expiresIn.value, max)
    } catch (cause) {
        const next = asError(cause)
        error.value = next
        emit('error', next)
    }
}

const generate = async () => {
    busy.value = true
    error.value = undefined
    try {
        const max = capabilities.value?.signedUrl.maxExpiresIn
        const ttl = max ? Math.min(expiresIn.value, max) : expiresIn.value
        url.value =
            props.mode === 'upload'
                ? (await props.files.signedUploadUrl(props.fileKey, { expiresIn: ttl })).url
                : await props.files.url(props.fileKey, {
                      expiresIn: ttl,
                      responseContentDisposition: disposition.value,
                  })
        emit('generated', url.value)
    } catch (cause) {
        const next = asError(cause)
        error.value = next
        emit('error', next)
    } finally {
        busy.value = false
    }
}

const copy = async () => {
    await navigator.clipboard.writeText(url.value)
    copied.value = true
}
</script>

<template>
    <span :dir="dir" :class="ui.root({ class: [props.ui?.root, props.class] })">
        <slot name="trigger" :open="open">
            <button class="nfs-button" type="button" @click="open">
                <FilesIcon name="link" />{{ t('share.generate') }}
            </button>
        </slot>
        <dialog ref="dialog" :class="ui.dialog({ class: props.ui?.dialog })">
            <form class="nfs-stack" method="dialog" @submit.prevent="generate">
                <h2 class="nfs-dialog-title">
                    {{ t(mode === 'download' ? 'share.titleDownload' : 'share.titleUpload') }}
                </h2>
                <label class="nfs-stack">
                    <span>{{ t('share.expiresAfter') }}</span>
                    <input
                        v-model.number="expiresIn"
                        class="nfs-input"
                        min="1"
                        :max="capabilities?.signedUrl.maxExpiresIn"
                        type="number"
                    />
                </label>
                <label v-if="mode === 'download'" class="nfs-stack">
                    <span>{{ t('share.openAs') }}</span>
                    <select v-model="disposition" class="nfs-select">
                        <option value="attachment">{{ t('share.attachment') }}</option>
                        <option value="inline">{{ t('share.inline') }}</option>
                    </select>
                </label>
                <p v-if="capabilities && !capabilities.signedUrl.supported" class="nfs-muted">
                    {{ t('share.permanent') }}
                </p>
                <div v-if="url" class="nfs-row">
                    <input class="nfs-input" :value="url" readonly />
                    <button class="nfs-button" type="button" @click="copy">
                        {{ t(copied ? 'share.copied' : 'share.copy') }}
                    </button>
                </div>
                <p v-if="error" :class="ui.error({ class: props.ui?.error })">{{ error.message }}</p>
                <div class="nfs-dialog-actions">
                    <button class="nfs-button" type="button" @click="dialog?.close()">{{ t('common.cancel') }}</button>
                    <button class="nfs-button nfs-button-primary" :disabled="busy" type="submit">
                        {{ t('share.generate') }}
                    </button>
                </div>
            </form>
        </dialog>
    </span>
</template>
