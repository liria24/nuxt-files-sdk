<script setup lang="ts">
import { ProgressIndicator, ProgressRoot } from 'reka-ui'
import { computed } from 'vue'

import type { FilesProgressOptions } from '../../runtime/control-options'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ options?: FilesProgressOptions; value: number; label?: string }>()
const percent = computed(() => Math.max(0, Math.min(100, props.value)))
</script>

<template>
    <ProgressRoot
        v-bind="$attrs"
        :model-value="percent"
        :max="100"
        :aria-label="label"
        :class="['nfs-control-progress', options?.class, options?.ui?.base, $attrs.class]"
        :data-color="options?.color ?? 'primary'"
        :data-size="options?.size ?? 'md'"
    >
        <ProgressIndicator
            :class="['nfs-control-progress-indicator', options?.ui?.indicator]"
            :style="{ width: `${percent}%` }"
        />
    </ProgressRoot>
</template>
