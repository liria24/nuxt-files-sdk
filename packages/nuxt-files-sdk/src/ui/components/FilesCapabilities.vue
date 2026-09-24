<script setup lang="ts">
import type { AdapterCapabilities } from 'files-sdk'
import type { FilesClient } from 'files-sdk/client'
import { computed, onMounted, ref } from 'vue'

import type { FilesMessages } from '../locale'
import { useFilesComponentProps } from '../runtime/component-props'
import { useFilesAppConfig } from '../runtime/context'
import { useFilesLocale } from '../runtime/locale'
import type { FilesClassValue, FilesUi } from '../runtime/theme'
import { resolveFilesTheme } from '../runtime/theme'
import { filesThemes } from '../runtime/themes'
import { asError } from '../runtime/utils'
import FilesIcon from './FilesIcon.vue'

defineOptions({ name: 'FilesCapabilities' })

interface Props {
    class?: FilesClassValue
    files: FilesClient
    supportedOnly?: boolean
    ui?: FilesUi
}

const rawProps = withDefaults(defineProps<Props>(), {
    supportedOnly: false,
})
const props = useFilesComponentProps('filesCapabilities', rawProps)
const emit = defineEmits<{ error: [error: Error] }>()
const appConfig = useFilesAppConfig()
const { dir, t } = useFilesLocale()
const theme = filesThemes.filesCapabilities
const ui = computed(() => resolveFilesTheme(theme, appConfig.value.ui?.filesCapabilities))
const capabilities = ref<AdapterCapabilities>()
const error = ref<Error>()
const entries = computed(() => {
    if (!capabilities.value) return []
    const c = capabilities.value
    return [
        ['rangeRead', c.rangeRead],
        ['uploadProgress', c.uploadProgress],
        ['delimiter', c.delimiter],
        ['metadata', c.metadata],
        ['cacheControl', c.cacheControl],
        ['multipart', c.multipart],
        ['serverSideCopy', c.serverSideCopy],
        ['signedUrl', c.signedUrl.supported],
    ].filter(([, supported]) => !props.supportedOnly || supported) as [keyof FilesMessages['capabilities'], boolean][]
})

onMounted(async () => {
    try {
        capabilities.value = await props.files.capabilities()
    } catch (cause) {
        const next = asError(cause)
        error.value = next
        emit('error', next)
    }
})
</script>

<template>
    <div :dir="dir" :class="ui.root({ class: [props.ui?.root, props.class] })">
        <p v-if="error" :class="ui.error({ class: props.ui?.error })">{{ error.message }}</p>
        <ul v-else-if="capabilities" :class="ui.list({ class: props.ui?.list })">
            <li v-for="[name, supported] in entries" :key="name" :class="ui.item({ class: props.ui?.item })">
                <FilesIcon :name="supported ? 'check' : 'close'" />
                <span>{{ t(`capabilities.${name}`) }}</span>
            </li>
        </ul>
        <div v-else class="nfs-loading"><FilesIcon class="nfs-spin" name="loading" /></div>
    </div>
</template>
