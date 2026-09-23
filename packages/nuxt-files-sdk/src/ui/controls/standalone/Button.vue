<script setup lang="ts">
import { computed, useSlots } from 'vue'

import { defaultFilesIcons, type FilesIconName } from '../../icons'
import { useFilesAppConfig, useFilesUiContext } from '../../runtime/context'
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
const context = useFilesUiContext()
const icon = computed(
    () =>
        props.options?.icon ??
        (props.icon && (config.value.ui?.files?.icons?.[props.icon] ?? defaultFilesIcons[props.icon])),
)
</script>

<template>
    <button
        v-bind="$attrs"
        :type="buttonType"
        :class="['nfs-control-button', options?.class, options?.ui?.base, $attrs.class]"
        :data-color="options?.color ?? defaultColor ?? 'primary'"
        :data-size="options?.size ?? 'md'"
        :data-variant="options?.variant ?? defaultVariant ?? 'solid'"
        :disabled="disabled || options?.disabled || loading || options?.loading"
        :aria-label="options?.ariaLabel"
        @click="emit('click', $event)"
    >
        <span v-if="icon" class="nfs-icon" aria-hidden="true"><component :is="context.icon" :name="icon" /></span>
        <template v-if="options?.label">{{ options.label }}</template>
        <slot v-else-if="slots.default" />
        <template v-else>{{ label }}</template>
    </button>
</template>
