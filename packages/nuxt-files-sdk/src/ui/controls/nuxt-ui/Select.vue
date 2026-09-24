<script setup lang="ts">
import USelect from '@nuxt/ui/components/Select.vue'

import type { FilesSelectOptions } from '../../runtime/control-options'

defineOptions({ inheritAttrs: false })
defineProps<{
    options?: FilesSelectOptions
    modelValue?: string
    items: { label: string; value: string }[]
    disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
    <USelect
        v-bind="{
            ...$attrs,
            ...(options?.color && { color: options.color }),
            ...(options?.size && { size: options.size }),
            ...(options?.variant && { variant: options.variant }),
            ...(options?.class !== undefined && { class: options.class }),
            ...(options?.ui && { ui: options.ui }),
        }"
        :items="items"
        :model-value="modelValue ?? ''"
        :disabled="Boolean(disabled || options?.disabled)"
        @update:model-value="emit('update:modelValue', String($event))"
    />
</template>
