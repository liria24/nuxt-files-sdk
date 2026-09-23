import { computed, inject, unref, type ComputedRef, type MaybeRef } from 'vue'

import { en, type FilesLocale, type FilesMessages } from '../locale'
import { useFilesUiContext } from './context'

interface LocaleLike {
    code?: string
    dir?: 'ltr' | 'rtl'
    messages?: { files?: Partial<FilesMessages> }
    name?: string
}

export interface FilesLocaleContext {
    code: ComputedRef<string>
    dir: ComputedRef<'ltr' | 'rtl'>
    formatBytes: (bytes: number) => string
    formatDate: (value: number, dateOnly?: boolean) => string
    t: (path: string, values?: Record<string, number | string>) => string
}

const localeContextInjectionKey = Symbol.for('nuxt-ui.locale-context')

const valueAt = (value: object, path: string): unknown => {
    let current: unknown = value
    for (const segment of path.split('.')) {
        if (!current || typeof current !== 'object') return undefined
        current = Reflect.get(current, segment)
    }
    return current
}

export const useFilesLocale = (): FilesLocaleContext => {
    const injected = inject<MaybeRef<LocaleLike | undefined> | undefined>(localeContextInjectionKey, undefined)
    const context = useFilesUiContext()
    const locale = computed<LocaleLike>(() => unref(injected) ?? unref(context.locale) ?? en)
    const code = computed(() => locale.value.code ?? en.code)
    const dir = computed(() => locale.value.dir ?? en.dir)
    const messages = computed(() => locale.value.messages?.files ?? en.messages.files)
    const t = (path: string, values?: Record<string, number | string>): string => {
        const local = valueAt(messages.value, path)
        const fallback = valueAt(en.messages.files, path)
        const template = typeof local === 'string' ? local : typeof fallback === 'string' ? fallback : path
        return template.replace(/\{(\w+)\}/gu, (match, key: string) => String(values?.[key] ?? match))
    }
    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B'
        const units = ['B', 'KB', 'MB', 'GB', 'TB']
        const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
        const amount = bytes / 1024 ** exponent
        return `${new Intl.NumberFormat(code.value, { maximumFractionDigits: exponent === 0 ? 0 : 1 }).format(amount)} ${units[exponent]}`
    }
    const formatDate = (value: number, dateOnly = false): string =>
        new Intl.DateTimeFormat(
            code.value,
            dateOnly ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' },
        ).format(value)
    return { code, dir, formatBytes, formatDate, t }
}

export type { FilesLocale }
