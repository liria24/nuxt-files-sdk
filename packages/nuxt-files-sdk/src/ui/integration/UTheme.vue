<script setup lang="ts">
import NuxtUiTheme from '@nuxt/ui/components/Theme.vue'
import type { ThemeProps } from '@nuxt/ui/components/Theme.vue'
import { computed } from 'vue'

import type { FilesThemeProps } from '../runtime/control-options'
import type { FilesClassValue } from '../runtime/theme'

type FilesComponentName =
    | 'filesActions'
    | 'filesBrowser'
    | 'filesCapabilities'
    | 'filesDropzone'
    | 'filesList'
    | 'filesMultipartUploader'
    | 'filesPreview'
    | 'filesSearch'
    | 'filesShareDialog'
    | 'filesTrashBin'
    | 'filesUploadProgress'
    | 'filesVersionHistory'

type FilesThemeDefaults = NonNullable<ThemeProps['props']> & FilesThemeProps
type FilesThemeUi = NonNullable<ThemeProps['ui']> & Partial<Record<FilesComponentName, Record<string, FilesClassValue>>>

const props = defineProps<{ props?: FilesThemeDefaults; ui?: FilesThemeUi }>()
const forwarded = computed(() => ({
    ...(props.props === undefined ? {} : { props: props.props }),
    ...(props.ui === undefined ? {} : { ui: props.ui }),
}))
</script>

<template>
    <NuxtUiTheme v-bind="forwarded">
        <slot />
    </NuxtUiTheme>
</template>
