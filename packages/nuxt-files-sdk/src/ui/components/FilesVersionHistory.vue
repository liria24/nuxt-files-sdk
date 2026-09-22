<script setup lang="ts">
import type { FilesClient } from 'files-sdk/client'
import { computed, onMounted, ref, watch } from 'vue'

import { useFilesComponentProps } from '../runtime/component-props'
import { useFilesAppConfig } from '../runtime/context'
import { useFilesLocale } from '../runtime/locale'
import type { FilesClassValue, FilesColor, FilesSize, FilesUi, FilesVariant } from '../runtime/theme'
import { resolveFilesTheme } from '../runtime/theme'
import { filesThemes } from '../runtime/themes'
import { asError } from '../runtime/utils'
import FilesIcon from './FilesIcon.vue'

defineOptions({ name: 'FilesVersionHistory' })

type FileVersion = Awaited<ReturnType<FilesClient['versions']>>[number]

interface Props {
    class?: FilesClassValue
    color?: FilesColor
    fileKey: string
    files: FilesClient
    size?: FilesSize
    ui?: FilesUi
    variant?: FilesVariant
}

const rawProps = withDefaults(defineProps<Props>(), { color: 'primary', size: 'md', variant: 'outline' })
const props = useFilesComponentProps('filesVersionHistory', rawProps)
const emit = defineEmits<{ error: [error: Error]; restored: [version: FileVersion] }>()
const appConfig = useFilesAppConfig()
const { dir, formatBytes, formatDate, t } = useFilesLocale()
const theme = filesThemes.filesVersionHistory
const ui = computed(() => resolveFilesTheme(theme, appConfig.value.ui?.filesVersionHistory, props))
const versions = ref<FileVersion[]>([])
const loading = ref(false)
const error = ref<Error>()
const mounted = ref(false)

const load = async () => {
    loading.value = true
    error.value = undefined
    try {
        versions.value = await props.files.versions(props.fileKey)
    } catch (cause) {
        const next = asError(cause)
        error.value = next
        emit('error', next)
    } finally {
        loading.value = false
    }
}
const restore = async (version: FileVersion) => {
    try {
        await props.files.restoreVersion(props.fileKey, version.versionId)
        emit('restored', version)
        await load()
    } catch (cause) {
        const next = asError(cause)
        error.value = next
        emit('error', next)
    }
}

onMounted(() => {
    mounted.value = true
    load()
})
watch(
    () => props.fileKey,
    () => mounted.value && load(),
)
defineExpose({ refresh: load })
</script>

<template>
    <div :dir="dir" :class="ui.root({ class: [props.ui?.root, props.class] })">
        <p v-if="error" :class="ui.error({ class: props.ui?.error })">{{ error.message }}</p>
        <div v-else-if="loading && !versions.length" class="nfs-loading">
            <FilesIcon class="nfs-spin" name="loading" />{{ t('common.loading') }}
        </div>
        <slot v-else-if="!versions.length" name="empty"
            ><div :class="ui.empty({ class: props.ui?.empty })">
                <FilesIcon name="history" />{{ t('versions.empty') }}
            </div></slot
        >
        <ul v-else :class="ui.list({ class: props.ui?.list })">
            <li v-for="version in versions" :key="version.versionId" :class="ui.item({ class: props.ui?.item })">
                <FilesIcon name="history" />
                <span class="nfs-file-info">
                    <span>{{ formatDate(version.lastModified) }}</span>
                    <span class="nfs-muted">{{ formatBytes(version.size) }} · {{ version.versionId }}</span>
                </span>
                <button class="nfs-button" type="button" @click="restore(version)">
                    <FilesIcon name="restore" />{{ t('versions.restore') }}
                </button>
            </li>
        </ul>
    </div>
</template>
