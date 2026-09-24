<script setup lang="ts">
import type { AdapterCapabilities } from 'files-sdk'
import type { FilesClient } from 'files-sdk/client'
import {
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogOverlay,
    DialogPortal,
    DialogRoot,
    DialogTitle,
    DialogTrigger,
} from 'reka-ui'
import { computed, ref } from 'vue'

import { useFilesComponentProps } from '../runtime/component-props'
import { useFilesAppConfig } from '../runtime/context'
import type { FilesButtonOptions, FilesInputOptions, FilesSelectOptions } from '../runtime/control-options'
import { useFilesLocale } from '../runtime/locale'
import type { FilesClassValue, FilesUi } from '../runtime/theme'
import { resolveFilesTheme } from '../runtime/theme'
import { filesThemes } from '../runtime/themes'
import { asError } from '../runtime/utils'

defineOptions({ name: 'FilesShareDialog' })

interface Props {
    cancel?: FilesButtonOptions
    class?: FilesClassValue
    copy?: FilesButtonOptions
    defaultExpiresIn?: number
    dispositionSelect?: FilesSelectOptions
    expiryInput?: FilesInputOptions
    fileKey: string
    files: FilesClient
    mode?: 'download' | 'upload'
    submit?: FilesButtonOptions
    trigger?: FilesButtonOptions
    ui?: FilesUi
    urlInput?: FilesInputOptions
}

const rawProps = withDefaults(defineProps<Props>(), {
    defaultExpiresIn: 3600,
    mode: 'download',
})
const props = useFilesComponentProps('filesShareDialog', rawProps)
const emit = defineEmits<{ error: [error: Error]; generated: [url: string] }>()
const appConfig = useFilesAppConfig()
const { dir, t } = useFilesLocale()
const theme = filesThemes.filesShareDialog
const ui = computed(() => resolveFilesTheme(theme, appConfig.value.ui?.filesShareDialog))
const dialogOpen = ref(false)
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
    dialogOpen.value = true
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
    <DialogRoot v-model:open="dialogOpen">
        <span :dir="dir" :class="ui.root({ class: [props.ui?.root, props.class] })">
            <DialogTrigger as-child>
                <slot name="trigger" :open="open">
                    <FilesControlButton
                        :options="props.trigger"
                        :label="t('share.generate')"
                        icon="link"
                        default-variant="outline"
                        @click="open"
                    />
                </slot>
            </DialogTrigger>
        </span>
        <DialogPortal>
            <DialogOverlay class="nfs-dialog-overlay" />
            <DialogContent :dir="dir" :class="ui.dialog({ class: props.ui?.dialog })">
                <form class="nfs-stack" @submit.prevent="generate">
                    <DialogTitle class="nfs-dialog-title">
                        {{ t(mode === 'download' ? 'share.titleDownload' : 'share.titleUpload') }}
                    </DialogTitle>
                    <DialogDescription class="sr-only">{{ fileKey }}</DialogDescription>
                    <label class="nfs-stack">
                        <span>{{ t('share.expiresAfter') }}</span>
                        <FilesControlInput
                            :model-value="expiresIn"
                            :options="props.expiryInput"
                            :min="1"
                            :max="capabilities?.signedUrl.maxExpiresIn"
                            input-type="number"
                            @update:model-value="expiresIn = Number($event)"
                        />
                    </label>
                    <label v-if="mode === 'download'" class="nfs-stack">
                        <span>{{ t('share.openAs') }}</span>
                        <FilesControlSelect
                            :model-value="disposition"
                            :options="props.dispositionSelect"
                            :items="[
                                { value: 'attachment', label: t('share.attachment') },
                                { value: 'inline', label: t('share.inline') },
                            ]"
                            @update:model-value="disposition = $event === 'inline' ? 'inline' : 'attachment'"
                        />
                    </label>
                    <p v-if="capabilities && !capabilities.signedUrl.supported" class="nfs-muted">
                        {{ t('share.permanent') }}
                    </p>
                    <div v-if="url" class="nfs-row">
                        <FilesControlInput :options="props.urlInput" :model-value="url" readonly class="nfs-grow" />
                        <FilesControlButton
                            :options="props.copy"
                            :label="t(copied ? 'share.copied' : 'share.copy')"
                            default-variant="outline"
                            @click="copy"
                        />
                    </div>
                    <p v-if="error" :class="ui.error({ class: props.ui?.error })">{{ error.message }}</p>
                    <div class="nfs-dialog-actions">
                        <DialogClose as-child>
                            <FilesControlButton
                                :options="props.cancel"
                                :label="t('common.cancel')"
                                default-variant="outline"
                            />
                        </DialogClose>
                        <FilesControlButton
                            :options="props.submit"
                            :label="t('share.generate')"
                            :disabled="busy"
                            :loading="busy"
                            button-type="submit"
                        />
                    </div>
                </form>
            </DialogContent>
        </DialogPortal>
    </DialogRoot>
</template>
