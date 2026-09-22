<script setup lang="ts">
import { computed } from 'vue'

import { defaultFilesIcons, type FilesIconName } from '../icons.js'
import { useFilesAppConfig, useFilesUiContext } from '../runtime/context.js'
import type { FilesClassValue } from '../runtime/theme.js'

const props = defineProps<{ class?: FilesClassValue; name: FilesIconName }>()
const context = useFilesUiContext()
const appConfig = useFilesAppConfig()
const icon = computed(
    () =>
        appConfig.value.ui?.files?.icons?.[props.name] ??
        appConfig.value.ui?.icons?.[props.name] ??
        defaultFilesIcons[props.name],
)
</script>

<template>
    <span :class="['nfs-icon', props.class]" aria-hidden="true">
        <component :is="context.icon" :name="icon" style="display: block; width: 100%; height: 100%" />
    </span>
</template>
