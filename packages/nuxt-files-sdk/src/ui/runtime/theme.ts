import { tv, type ClassValue } from 'tailwind-variants'

import type { FilesTheme } from './themes'

export type FilesColor = 'error' | 'info' | 'neutral' | 'primary' | 'secondary' | 'success' | 'warning'
export type FilesVariant = 'ghost' | 'outline' | 'soft' | 'solid' | 'subtle'
export type FilesSize = 'lg' | 'md' | 'sm' | 'xl' | 'xs'
export type FilesClassValue = ClassValue
export type FilesUi = Record<string, FilesClassValue>

export interface FilesUiProps {
    class?: FilesClassValue
    color?: FilesColor
    size?: FilesSize
    ui?: FilesUi
    variant?: FilesVariant
}

export interface FilesAppConfig {
    ui?: Partial<Record<keyof typeof import('./themes').filesThemes, object>> & {
        files?: { icons?: Record<string, string> }
        icons?: Record<string, string>
    }
}

export type ResolvedFilesTheme<Theme extends FilesTheme> = {
    [Slot in keyof Theme['slots']]: (options?: { class?: FilesClassValue }) => string
}

export function resolveFilesTheme<const Theme extends FilesTheme>(
    base: Theme,
    config: object | undefined,
    props: Pick<FilesUiProps, 'color' | 'size' | 'variant'>,
): ResolvedFilesTheme<Theme>
export function resolveFilesTheme(
    base: FilesTheme,
    config: object | undefined,
    props: Pick<FilesUiProps, 'color' | 'size' | 'variant'>,
): unknown {
    const themed = tv({
        extend: tv(base),
        ...config,
    })
    return themed(props)
}
