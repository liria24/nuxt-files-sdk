<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue'
import { computed, useSlots } from 'vue'

import { defaultFilesIcons, type FilesIconName } from '../../icons'
import { useFilesAppConfig } from '../../runtime/context'
import type { FilesButtonOptions } from '../../runtime/control-options'
import type { FilesColor, FilesVariant } from '../../runtime/theme'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
    defineProps<{
        options?: FilesButtonOptions
        label?: string
        icon?: FilesIconName
        disabled?: boolean
        loading?: boolean
        buttonType?: 'button' | 'submit'
        defaultColor?: FilesColor
        defaultVariant?: FilesVariant
    }>(),
    { buttonType: 'button' },
)
const emit = defineEmits<{ click: [event: MouseEvent] }>()
const slots = useSlots()
const config = useFilesAppConfig()
const icon = computed(
    () =>
        props.options?.icon ??
        (props.icon && (config.value.ui?.files?.icons?.[props.icon] ?? defaultFilesIcons[props.icon])),
)
const button = computed(() => {
    const { ariaLabel, class: customClass, color, size, variant, ui, label, disabled, loading } = props.options ?? {}
    return {
        ...(customClass !== undefined && { class: customClass }),
        ...((color ?? props.defaultColor) && { color: color ?? props.defaultColor }),
        ...(size && { size }),
        ...((variant ?? props.defaultVariant) && { variant: variant ?? props.defaultVariant }),
        ...(ui && { ui }),
        type: props.buttonType,
        ...(ariaLabel && { 'aria-label': ariaLabel }),
        ...(label || (!slots.default && props.label) ? { label: label ?? props.label } : {}),
        ...(icon.value && { icon: icon.value }),
        disabled: Boolean(props.disabled || disabled),
        loading: Boolean(props.loading || loading),
    }
})
</script>

<template>
    <UButton v-if="!slots.default || options?.label" v-bind="{ ...$attrs, ...button }" @click="emit('click', $event)" />
    <UButton v-else v-bind="{ ...$attrs, ...button }" @click="emit('click', $event)">
        <slot />
    </UButton>
</template>
