import { Icon as IconifyIcon } from '@iconify/vue'
import { computed, defineComponent, h, inject, unref, type Component, type MaybeRef, type Plugin } from 'vue'

import type { FilesLocale } from '../locale'
import type { FilesAppConfig } from './theme'

export interface FilesUiContext {
    config: MaybeRef<FilesAppConfig>
    icon: Component
    locale?: MaybeRef<FilesLocale | undefined>
    resolveComponentProps?: <T extends object>(name: string, props: T) => T
}

const IconifyRenderer = defineComponent({
    inheritAttrs: false,
    props: { name: { type: String, required: true } },
    setup:
        (props, { attrs }) =>
        () =>
            h(IconifyIcon, { ...attrs, icon: props.name.replace(/^i-([^-]+)-/u, '$1:') }),
})

export const filesUiContextKey = Symbol.for('nuxt-files-sdk.ui-context')

const fallback: FilesUiContext = { config: {}, icon: IconifyRenderer }

export const createFilesUi = (options: Partial<FilesUiContext> = {}): Plugin => ({
    install(app) {
        app.provide(filesUiContextKey, { ...fallback, ...options })
    },
})

export const useFilesUiContext = (): FilesUiContext => inject(filesUiContextKey, fallback)

export const useFilesAppConfig = () => {
    const context = useFilesUiContext()
    return computed(() => unref(context.config))
}
