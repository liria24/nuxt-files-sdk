<script setup lang="ts">
import type { SearchMatch, StoredFile } from 'files-sdk'
import type { FilesClient } from 'files-sdk/client'
import { computed, onBeforeUnmount, ref } from 'vue'

import { useFilesComponentProps } from '../runtime/component-props'
import { useFilesAppConfig } from '../runtime/context'
import type {
    FilesButtonOptions,
    FilesCheckboxOptions,
    FilesInputOptions,
    FilesSelectOptions,
} from '../runtime/control-options'
import { useFilesLocale } from '../runtime/locale'
import type { FilesClassValue, FilesUi } from '../runtime/theme'
import { resolveFilesTheme } from '../runtime/theme'
import { filesThemes } from '../runtime/themes'
import { asError, createLatestRequest } from '../runtime/utils'
import FilesIcon from './FilesIcon.vue'

defineOptions({ name: 'FilesSearch' })

interface Props {
    caseInsensitive?: FilesCheckboxOptions
    class?: FilesClassValue
    defaultMatch?: SearchMatch
    files: FilesClient
    maxResults?: number
    match?: FilesSelectOptions
    prefix?: string
    query?: FilesInputOptions
    result?: FilesButtonOptions
    submit?: FilesButtonOptions
    ui?: FilesUi
}

const rawProps = withDefaults(defineProps<Props>(), {
    defaultMatch: 'substring',
    maxResults: 100,
    prefix: '',
})
const props = useFilesComponentProps('filesSearch', rawProps)
const emit = defineEmits<{ error: [error: Error]; select: [file: StoredFile] }>()
const appConfig = useFilesAppConfig()
const { dir, formatBytes, t } = useFilesLocale()
const theme = filesThemes.filesSearch
const ui = computed(() => resolveFilesTheme(theme, appConfig.value.ui?.filesSearch))
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
            <FilesControlInput
                v-model="query"
                :options="props.query"
                :placeholder="t('search.placeholder')"
                input-type="search"
                class="nfs-grow"
            />
            <FilesControlButton
                :options="props.submit"
                :label="t('search.search')"
                icon="search"
                :loading="searching"
                button-type="submit"
            />
        </div>
        <div class="nfs-row">
            <label
                ><span class="nfs-sr-only">Match</span
                ><FilesControlSelect
                    v-model="match"
                    :options="props.match"
                    :items="[
                        { label: 'substring', value: 'substring' },
                        { label: 'glob', value: 'glob' },
                        { label: 'regex', value: 'regex' },
                        { label: 'exact', value: 'exact' },
                    ]"
            /></label>
            <FilesControlCheckbox
                v-model="caseInsensitive"
                :options="props.caseInsensitive"
                :label="t('search.caseInsensitive')"
            />
        </div>
        <p v-if="error" :class="ui.error({ class: props.ui?.error })">{{ error.message }}</p>
        <p v-else class="nfs-muted" aria-live="polite">{{ t('search.matches', { count: results.length }) }}</p>
        <slot name="content" :results="results">
            <ul v-if="results.length" :class="ui.list({ class: props.ui?.list })">
                <li v-for="file in results" :key="file.key" :class="ui.item({ class: props.ui?.item })">
                    <FilesControlButton
                        :options="props.result"
                        class="nfs-clickable"
                        default-variant="ghost"
                        @click="emit('select', file)"
                    >
                        <FilesIcon name="file" /><span class="nfs-grow nfs-truncate">{{ file.key }}</span
                        ><span class="nfs-muted">{{ formatBytes(file.size) }}</span>
                    </FilesControlButton>
                </li>
            </ul>
        </slot>
    </form>
</template>
