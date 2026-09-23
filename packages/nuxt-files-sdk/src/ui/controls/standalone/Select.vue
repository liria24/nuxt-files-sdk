<script setup lang="ts">
import {
    SelectContent,
    SelectItem,
    SelectItemText,
    SelectPortal,
    SelectRoot,
    SelectTrigger,
    SelectValue,
    SelectViewport,
} from 'reka-ui'

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
    <SelectRoot
        :model-value="modelValue ?? ''"
        :disabled="Boolean(disabled || options?.disabled)"
        @update:model-value="emit('update:modelValue', String($event))"
    >
        <SelectTrigger
            v-bind="$attrs"
            :class="['nfs-control-input nfs-control-select-trigger', options?.class, options?.ui?.base, $attrs.class]"
            :data-color="options?.color ?? 'primary'"
            :data-size="options?.size ?? 'md'"
            :data-variant="options?.variant ?? 'outline'"
        >
            <SelectValue />
            <span aria-hidden="true">⌄</span>
        </SelectTrigger>
        <SelectPortal>
            <SelectContent
                :class="['nfs-root nfs-control-select-content', options?.ui?.content]"
                position="popper"
                :side-offset="4"
            >
                <SelectViewport>
                    <SelectItem
                        v-for="item in items"
                        :key="item.value"
                        :value="item.value"
                        :class="['nfs-control-select-item', options?.ui?.item]"
                    >
                        <SelectItemText>{{ item.label }}</SelectItemText>
                    </SelectItem>
                </SelectViewport>
            </SelectContent>
        </SelectPortal>
    </SelectRoot>
</template>
