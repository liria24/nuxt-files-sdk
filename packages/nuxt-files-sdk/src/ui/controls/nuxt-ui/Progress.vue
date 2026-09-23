<script setup lang="ts">
import UProgress from '@nuxt/ui/components/Progress.vue'

import type { FilesProgressOptions } from '../../runtime/control-options'

defineOptions({ inheritAttrs: false })
defineProps<{ options?: FilesProgressOptions; value: number; label?: string }>()
</script>

<template>
    <UProgress
        v-bind="{
            ...$attrs,
            ...(options?.color && { color: options.color }),
            ...(options?.size && { size: options.size }),
            ...(options?.class !== undefined && { class: options.class }),
            ...(options?.ui && { ui: options.ui }),
        }"
        :model-value="value"
        :max="100"
        :aria-label="label"
    />
</template>
