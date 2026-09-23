import { describe, expect, test } from 'vitest'
import { createSSRApp, h, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'

import type { FilesButtonOptions, FilesThemeProps } from '../../packages/nuxt-files-sdk/src/module'
import { en, type FilesLocale, withFilesLocale, withFilesLocales } from '../../packages/nuxt-files-sdk/src/ui/locale'
import { useFilesLocale, type FilesLocaleContext } from '../../packages/nuxt-files-sdk/src/ui/runtime/locale'
import { resolveFilesTheme } from '../../packages/nuxt-files-sdk/src/ui/runtime/theme'
import { createFilesTheme, filesThemes } from '../../packages/nuxt-files-sdk/src/ui/runtime/themes'
import { createLatestRequest, parentOf, proxyUrl } from '../../packages/nuxt-files-sdk/src/ui/runtime/utils'

describe('Files UI runtime', () => {
    test('[UI-002] accepts operation options and rejects operation replacement props', () => {
        const theme = { filesDropzone: { trigger: { color: 'secondary', size: 'sm' } } } satisfies FilesThemeProps
        expect(theme.filesDropzone.trigger.color).toBe('secondary')
        // @ts-expect-error Root color was replaced by operation options.
        const rootColor: FilesThemeProps = { filesDropzone: { color: 'error' } }
        // @ts-expect-error Files operations do not accept navigation targets.
        const navigation: FilesButtonOptions = { href: '/files' }
        // @ts-expect-error Files operations own their click handlers.
        const handler: FilesButtonOptions = { onClick: () => {} }
        // @ts-expect-error Files operations own the HTML button type.
        const buttonType: FilesButtonOptions = { type: 'submit' }
        void [rootColor, navigation, handler, buttonType]
    })
    test('[UI-006] augments single and namespace locales without mutation or lost types', () => {
        const base = { name: 'Test', code: 'ja', dir: 'rtl' as const, messages: { common: { save: 'Save' } } }
        const merged = withFilesLocale(base)
        expect(merged).not.toBe(base)
        expect(merged.messages).not.toBe(base.messages)
        expect(merged.messages.common).toBe(base.messages.common)
        expect(merged.messages.files.common.loading).toBe('Loading…')
        expect(merged.code).toBe('ja')
        expect(merged.dir).toBe('rtl')
        expect(base.messages).not.toHaveProperty('files')

        const uiLocales = {
            en: { name: 'English', code: 'en', dir: 'ltr' as const, messages: { common: { save: 'Save' } } },
            ar: { name: 'العربية', code: 'ar', dir: 'rtl' as const, messages: { common: { save: 'حفظ' } } },
        }
        const locales = withFilesLocales(uiLocales)
        expect(locales.en.messages.files.common.loading).toBe('Loading…')
        expect(locales.ar.dir).toBe(uiLocales.ar.dir)
        expect(locales.en.messages).not.toBe(uiLocales.en.messages)
    })

    test('[UI-003] follows the UApp locale context reactively and falls back per message', async () => {
        const locale = ref<FilesLocale>({
            ...en,
            code: 'en-US',
            dir: 'rtl' as const,
            messages: { files: { ...en.messages.files, common: { ...en.messages.files.common, loading: 'Working' } } },
        })
        let context: FilesLocaleContext | undefined
        const app = createSSRApp({
            setup() {
                context = useFilesLocale()
                return () => h('p', { dir: context!.dir.value }, context!.t('common.loading'))
            },
        })
        app.provide(Symbol.for('nuxt-ui.locale-context'), locale)

        await expect(renderToString(app)).resolves.toContain('dir="rtl">Working')
        expect(context!.t('common.cancel')).toBe('Cancel')
        expect(context!.formatBytes(1024)).toBe('1 KB')

        locale.value = { ...en, code: 'en-GB', dir: 'ltr', messages: en.messages }
        await nextTick()
        expect(context!.dir.value).toBe('ltr')
        expect(context!.t('common.loading')).toBe('Loading…')
    })

    test('[UI-002] composes built-in, app-config, and prop classes', () => {
        const base = createFilesTheme({ root: 'base', item: 'item' })
        const theme = resolveFilesTheme(base, { slots: { root: 'configured' } })
        expect(theme.root({ class: 'instance' })).toContain('base')
        expect(theme.root({ class: 'instance' })).toContain('configured')
        expect(theme.root({ class: 'instance' })).toContain('instance')
        expect(filesThemes.filesDropzone.slots.dropzone).toContain('min-h-40')
        for (const { slots } of [filesThemes.filesActions, filesThemes.filesShareDialog]) {
            expect(slots.dialog.split(' ')).toContain('fixed')
            expect(slots.dialog.split(' ')).toContain('flex')
        }
        expect(filesThemes.filesDropzone).not.toHaveProperty('defaultVariants')
    })

    test('keeps key and gateway URL handling deterministic', () => {
        expect(parentOf('a/b.txt')).toBe('a/')
        expect(parentOf('b.txt')).toBe('')
        expect(proxyUrl('/api/files', 'a b.txt')).toBe('/api/files?op=download&key=a%20b.txt')
    })

    test('[DEV-006] stale UI requests are aborted and cannot become current again', () => {
        const requests = createLatestRequest()
        const first = requests.next()
        expect(requests.current(first)).toBe(true)
        const second = requests.next()
        expect(first.signal.aborted).toBe(true)
        expect(requests.current(first)).toBe(false)
        expect(requests.current(second)).toBe(true)
        requests.abort()
        expect(requests.current(second)).toBe(false)
    })
})
