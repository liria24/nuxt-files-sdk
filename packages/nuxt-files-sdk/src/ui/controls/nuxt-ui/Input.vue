<script setup lang="ts">
import UInput from '@nuxt/ui/components/Input.vue'

import type { FilesInputOptions } from '../../runtime/control-options'

defineOptions({ inheritAttrs: false })
const props = withDefaults(
    defineProps<{
        options?: FilesInputOptions
        modelValue?: string | number
        inputType?: 'text' | 'search' | 'number'
        placeholder?: string
        disabled?: boolean
        readonly?: boolean
        min?: number
        max?: number
    }>(),
    { inputType: 'text' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()
</script>

<template>
    <UInput
        v-bind="{
            ...$attrs,
            ...(options?.color && { color: options.color }),
            ...(options?.size && { size: options.size }),
            ...(options?.variant && { variant: options.variant }),
            ...(options?.class !== undefined && { class: options.class }),
            ...(options?.ui && { ui: options.ui }),
            ...((options?.placeholder ?? placeholder) ? { placeholder: options?.placeholder ?? placeholder } : {}),
            ...(min !== undefined && { min: String(min) }),
            ...(max !== undefined && { max: String(max) }),
        }"
        :type="inputType"
        :model-value="String(modelValue ?? '')"
        :disabled="Boolean(disabled || options?.disabled)"
        :readonly="readonly"
        @update:model-value="emit('update:modelValue', String($event ?? ''))"
    />
</template>
