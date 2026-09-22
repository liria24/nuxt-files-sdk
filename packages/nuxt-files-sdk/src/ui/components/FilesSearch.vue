<script setup lang="ts">
import type { SearchMatch, StoredFile } from 'files-sdk'
import type { FilesClient } from 'files-sdk/client'
import { computed, onBeforeUnmount, ref } from 'vue'

import { useFilesComponentProps } from '../runtime/component-props'
import { useFilesAppConfig } from '../runtime/context'
import { useFilesLocale } from '../runtime/locale'
import type { FilesClassValue, FilesColor, FilesSize, FilesUi, FilesVariant } from '../runtime/theme'
import { resolveFilesTheme } from '../runtime/theme'
import { filesThemes } from '../runtime/themes'
import { asError, createLatestRequest } from '../runtime/utils'
import FilesIcon from './FilesIcon.vue'

defineOptions({ name: 'FilesSearch' })

interface Props {
    class?: FilesClassValue
    color?: FilesColor
    defaultMatch?: SearchMatch
    files: FilesClient
    maxResults?: number
    prefix?: string
    size?: FilesSize
    ui?: FilesUi
    variant?: FilesVariant
}

const rawProps = withDefaults(defineProps<Props>(), {
    color: 'primary',
    defaultMatch: 'substring',
    maxResults: 100,
    prefix: '',
    size: 'md',
    variant: 'outline',
})
const props = useFilesComponentProps('filesSearch', rawProps)
const emit = defineEmits<{ error: [error: Error]; select: [file: StoredFile] }>()
const appConfig = useFilesAppConfig()
const { dir, formatBytes, t } = useFilesLocale()
const theme = filesThemes.filesSearch
const ui = computed(() => resolveFilesTheme(theme, appConfig.value.ui?.filesSearch, props))
const query = ref('')
const match = ref<SearchMatch>(props.defaultMatch)
const caseInsensitive = ref(false)
const results = ref<StoredFile[]>([])
const searching = ref(false)
const error = ref<Error>()
const requests = createLatestRequest()

const search = async () => {
    const request = requests.next()
    results.value = []
    error.value = undefined
    if (!query.value) {
        searching.value = false
        return
    }
    searching.value = true
    try {
        for await (const file of props.files.search(query.value, {
            caseInsensitive: caseInsensitive.value,
            match: match.value,
            maxResults: props.maxResults,
            prefix: props.prefix,
            signal: request.signal,
        })) {
            if (requests.current(request)) results.value.push(file)
        }
    } catch (cause) {
        if (!requests.current(request)) return
        const next = asError(cause)
        error.value = next
        emit('error', next)
    } finally {
        if (requests.current(request)) searching.value = false
    }
}

onBeforeUnmount(requests.abort)
</script>

<template>
    <form :dir="dir" :class="ui.root({ class: [props.ui?.root, props.class] })" role="search" @submit.prevent="search">
        <div class="nfs-row">
            <input v-model="query" class="nfs-input" :placeholder="t('search.placeholder')" type="search" />
            <button class="nfs-button nfs-button-primary" :disabled="searching" type="submit">
                <FilesIcon :class="searching ? 'nfs-spin' : undefined" :name="searching ? 'loading' : 'search'" />{{
                    t('search.search')
                }}
            </button>
        </div>
        <div class="nfs-row">
            <label class="nfs-grow"
                ><span class="nfs-sr-only">Match</span
                ><select v-model="match" class="nfs-select">
                    <option value="substring">substring</option>
                    <option value="glob">glob</option>
                    <option value="regex">regex</option>
                    <option value="exact">exact</option>
                </select></label
            >
            <label class="nfs-row"
                ><input v-model="caseInsensitive" type="checkbox" />{{ t('search.caseInsensitive') }}</label
            >
        </div>
        <p v-if="error" :class="ui.error({ class: props.ui?.error })">{{ error.message }}</p>
        <p v-else class="nfs-muted" aria-live="polite">{{ t('search.matches', { count: results.length }) }}</p>
        <slot name="content" :results="results">
            <ul v-if="results.length" :class="ui.list({ class: props.ui?.list })">
                <li v-for="file in results" :key="file.key" :class="ui.item({ class: props.ui?.item })">
                    <button class="nfs-clickable" type="button" @click="emit('select', file)">
                        <FilesIcon name="file" /><span class="nfs-grow nfs-truncate">{{ file.key }}</span
                        ><span class="nfs-muted">{{ formatBytes(file.size) }}</span>
                    </button>
                </li>
            </ul>
        </slot>
    </form>
</template>
