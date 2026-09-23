<script setup lang="ts">
import UCheckbox from '@nuxt/ui/components/Checkbox.vue'

import type { FilesCheckboxOptions } from '../../runtime/control-options'

defineOptions({ inheritAttrs: false })
defineProps<{
    options?: FilesCheckboxOptions
    modelValue?: boolean
    label?: string
    disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
    <UCheckbox
        v-bind="{
            ...$attrs,
            ...(options?.color && { color: options.color }),
            ...(options?.size && { size: options.size }),
            ...(options?.variant && { variant: options.variant }),
            ...(options?.class !== undefined && { class: options.class }),
            ...(options?.ui && { ui: options.ui }),
            ...((options?.label ?? label) ? { label: options?.label ?? label } : {}),
        }"
        :model-value="modelValue"
        :disabled="Boolean(disabled || options?.disabled)"
        @update:model-value="emit('update:modelValue', Boolean($event))"
    />
</template>
