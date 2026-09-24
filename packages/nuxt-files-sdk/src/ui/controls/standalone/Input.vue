<script setup lang="ts">
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
    <input
        v-bind="$attrs"
        :class="['nfs-control-input', options?.class, options?.ui?.base, $attrs.class]"
        :data-color="options?.color ?? 'primary'"
        :data-size="options?.size ?? 'md'"
        :data-variant="options?.variant ?? 'outline'"
        :type="inputType"
        :value="modelValue"
        :placeholder="options?.placeholder ?? placeholder"
        :disabled="disabled || options?.disabled"
        :readonly="readonly"
        :min="min"
        :max="max"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
</template>
