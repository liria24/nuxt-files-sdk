<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'

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
    <label
        :class="['nfs-control-checkbox-label', options?.class, options?.ui?.label, $attrs.class]"
        :data-variant="options?.variant"
    >
        <CheckboxRoot
            v-bind="$attrs"
            :model-value="modelValue"
            :disabled="Boolean(disabled || options?.disabled)"
            :class="['nfs-control-checkbox', options?.ui?.base]"
            :data-color="options?.color ?? 'primary'"
            :data-size="options?.size ?? 'md'"
            @update:model-value="emit('update:modelValue', Boolean($event))"
        >
            <CheckboxIndicator>✓</CheckboxIndicator>
        </CheckboxRoot>
        <span>{{ options?.label ?? label }}</span>
    </label>
</template>
