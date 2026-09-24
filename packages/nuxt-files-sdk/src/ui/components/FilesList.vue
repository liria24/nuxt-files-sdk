<script setup lang="ts">
import type { StoredFile } from 'files-sdk'
import type { FilesClient } from 'files-sdk/client'
import { computed, onMounted, ref } from 'vue'

import { allFilesActions, type FilesAction } from '../runtime/actions'
import { useFilesComponentProps } from '../runtime/component-props'
import { useFilesAppConfig } from '../runtime/context'
import type { FilesActionControls, FilesButtonOptions } from '../runtime/control-options'
import { useFilesLocale } from '../runtime/locale'
import type { FilesClassValue, FilesUi } from '../runtime/theme'
import { resolveFilesTheme } from '../runtime/theme'
import { filesThemes } from '../runtime/themes'
import { asError, proxyUrl } from '../runtime/utils'
import FilesActions from './FilesActions.vue'
import FilesIcon from './FilesIcon.vue'

defineOptions({ name: 'FilesList' })

interface Props {
    actions?: FilesAction[]
    class?: FilesClassValue
    endpoint?: string
    file?: FilesButtonOptions
    fileActions?: FilesActionControls
    files: FilesClient
    loadMore?: FilesButtonOptions
    prefix?: string
    readOnly?: boolean
    refresh?: FilesButtonOptions
    thumbnails?: boolean
    ui?: FilesUi
}

const rawProps = withDefaults(defineProps<Props>(), {
    actions: () => allFilesActions,
    endpoint: '/api/files',
    prefix: '',
    readOnly: false,
    thumbnails: true,
})
const props = useFilesComponentProps('filesList', rawProps)
const emit = defineEmits<{ changed: []; error: [error: Error]; select: [file: StoredFile] }>()
const appConfig = useFilesAppConfig()
const { dir, formatBytes, formatDate, t } = useFilesLocale()
const theme = filesThemes.filesList
const ui = computed(() => resolveFilesTheme(theme, appConfig.value.ui?.filesList))
const items = ref<StoredFile[]>([])
const cursor = ref<string>()
const thumbnails = ref<Record<string, string>>({})
const loading = ref(false)
const error = ref<Error>()

const load = async (append = false) => {
    loading.value = true
    error.value = undefined
    try {
        const result = await props.files.list({
            prefix: props.prefix,
            ...(append && cursor.value !== undefined && { cursor: cursor.value }),
        })
        items.value = append ? [...items.value, ...result.items] : result.items
        cursor.value = result.cursor
        if (props.thumbnails) {
            const capabilities = await props.files.capabilities()
            await Promise.all(
                result.items
                    .filter((item) => item.type.startsWith('image/'))
                    .map(async (file) => {
                        thumbnails.value[file.key] = capabilities.signedUrl.supported
                            ? await props.files.url(file.key, { expiresIn: 3600 })
                            : proxyUrl(props.endpoint, file.key)
                    }),
            )
        }
    } catch (cause) {
        const next = asError(cause)
        error.value = next
        emit('error', next)
    } finally {
        loading.value = false
    }
}

const changed = async () => {
    await load()
    emit('changed')
}

onMounted(() => load())
defineExpose({ refresh: () => load() })
</script>

<template>
    <div :dir="dir" :class="ui.root({ class: [props.ui?.root, props.class] })">
        <div class="nfs-row nfs-between">
            <span class="nfs-muted">{{ t('common.fileCount', { count: items.length }) }}</span>
            <FilesControlButton
                :options="{ ...props.refresh, ariaLabel: props.refresh?.ariaLabel ?? t('list.refresh') }"
                icon="refresh"
                default-variant="ghost"
                :disabled="loading"
                @click="load()"
            />
        </div>
        <p v-if="error" :class="ui.error({ class: props.ui?.error })">{{ error.message }}</p>
        <div v-else-if="loading && !items.length" class="nfs-loading">
            <FilesIcon class="nfs-spin" name="loading" />{{ t('common.loading') }}
        </div>
        <slot v-else-if="!items.length" name="empty">
            <div :class="ui.empty({ class: props.ui?.empty })">
                <FilesIcon class="nfs-icon-lg" name="file" />{{ t('list.empty') }}
            </div>
        </slot>
        <slot v-else name="content" :items="items" :reload="load">
            <ul :class="ui.list({ class: props.ui?.list })">
                <li v-for="file in items" :key="file.key" :class="ui.item({ class: props.ui?.item })">
                    <FilesControlButton
                        :options="props.file"
                        class="nfs-clickable"
                        default-variant="ghost"
                        @click="emit('select', file)"
                    >
                        <img v-if="thumbnails[file.key]" class="nfs-thumbnail" :src="thumbnails[file.key]" alt="" />
                        <span v-else class="nfs-tile"><FilesIcon name="file" /></span>
                        <span class="nfs-file-info">
                            <span class="nfs-truncate">{{ file.key }}</span>
                            <span class="nfs-muted"
                                >{{ formatBytes(file.size)
                                }}<template v-if="file.lastModified">
                                    · {{ formatDate(file.lastModified) }}</template
                                ></span
                            >
                        </span>
                    </FilesControlButton>
                    <FilesActions
                        v-if="!readOnly && actions.length"
                        :actions="actions"
                        v-bind="fileActions"
                        :ui="{ menu: 'start-auto end-0' }"
                        :file-key="file.key"
                        :files="files"
                        @changed="changed"
                        @error="emit('error', $event)"
                    />
                </li>
            </ul>
        </slot>
        <FilesControlButton
            v-if="cursor"
            :options="props.loadMore"
            :label="t('browser.loadMore')"
            default-variant="outline"
            :disabled="loading"
            @click="load(true)"
        />
    </div>
</template>
