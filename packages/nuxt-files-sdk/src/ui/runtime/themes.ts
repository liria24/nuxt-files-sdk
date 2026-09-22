const root = 'nfs-root box-border min-w-0 leading-5'
const stack = `${root} flex flex-col gap-3`
const list = 'm-0 flex list-none flex-col gap-2 p-0'
const item =
    'flex min-w-0 flex-wrap items-center gap-3 border border-[var(--nfs-border)] bg-[var(--nfs-bg)] p-2 [border-radius:var(--nfs-radius)]'
const empty = 'flex min-h-32 flex-col items-center justify-center gap-2 text-center text-[var(--nfs-text-muted)]'
const error = 'text-[var(--nfs-error)]'
const dialog =
    'm-auto open:flex max-h-[calc(100dvh-2rem)] overflow-y-auto w-[min(30rem,calc(100%-2rem))] flex-col gap-3 border border-[var(--nfs-border)] bg-[var(--nfs-bg)] p-4 text-[var(--nfs-text)] shadow-2xl [border-radius:var(--nfs-radius)] backdrop:bg-black/50'

const colors = {
    error: { root: '[--nfs-color:var(--ui-error,#dc2626)]' },
    info: { root: '[--nfs-color:var(--ui-info,#0284c7)]' },
    neutral: { root: '[--nfs-color:var(--ui-bg-inverted,#18181b)]' },
    primary: { root: '[--nfs-color:var(--ui-primary,#2563eb)]' },
    secondary: { root: '[--nfs-color:var(--ui-secondary,#7c3aed)]' },
    success: { root: '[--nfs-color:var(--ui-success,#16a34a)]' },
    warning: { root: '[--nfs-color:var(--ui-warning,#d97706)]' },
} as const

const sizes = {
    lg: { root: 'text-sm [--nfs-px:.75rem] [--nfs-py:.5rem] [--nfs-gap:.5rem] [--nfs-icon-size:1.25rem]' },
    md: { root: 'text-sm [--nfs-px:.625rem] [--nfs-py:.375rem] [--nfs-gap:.375rem] [--nfs-icon-size:1.25rem]' },
    sm: { root: 'text-xs [--nfs-px:.625rem] [--nfs-py:.375rem] [--nfs-gap:.375rem] [--nfs-icon-size:1rem]' },
    xl: { root: 'text-base [--nfs-px:.75rem] [--nfs-py:.5rem] [--nfs-gap:.5rem] [--nfs-icon-size:1.5rem]' },
    xs: { root: 'text-xs [--nfs-px:.5rem] [--nfs-py:.25rem] [--nfs-gap:.25rem] [--nfs-icon-size:1rem]' },
} as const

const variants = {
    ghost: { root: 'border-transparent' },
    outline: { root: 'border-[var(--nfs-border)]' },
    soft: { root: 'bg-[color-mix(in_srgb,var(--nfs-color)_10%,var(--nfs-bg))]' },
    solid: { root: 'bg-[var(--nfs-color)] text-[var(--nfs-inverted)]' },
    subtle: {
        root: 'border-[color-mix(in_srgb,var(--nfs-color)_25%,var(--nfs-border))] bg-[color-mix(in_srgb,var(--nfs-color)_5%,var(--nfs-bg))]',
    },
} as const

export const createFilesTheme = <const Slots extends { root: string }>(
    slots: Slots,
    variant: keyof typeof variants = 'outline',
) => ({
    slots,
    variants: { color: colors, size: sizes, variant: variants },
    compoundVariants: [],
    defaultVariants: { color: 'primary' as const, size: 'md' as const, variant },
})

export const filesThemes = {
    filesActions: createFilesTheme(
        {
            root: `${root} inline-flex shrink-0`,
            trigger: 'nfs-icon-button',
            menu: 'nfs-menu absolute start-0 top-[calc(100%+0.25rem)] z-20 min-w-40 border border-[var(--nfs-border)] bg-[var(--nfs-bg)] p-1 shadow-xl [border-radius:var(--nfs-radius)]',
            dialog,
            error,
        },
        'ghost',
    ),
    filesBrowser: createFilesTheme({
        root: stack,
        breadcrumb: 'flex flex-wrap items-center gap-0.5',
        list,
        item,
        empty,
        error,
    }),
    filesCapabilities: createFilesTheme({ root: stack, list, item, error }),
    filesDropzone: createFilesTheme({
        root: stack,
        dropzone:
            'flex min-h-40 w-full cursor-pointer flex-col items-center justify-center gap-3 transition-colors disabled:cursor-not-allowed disabled:opacity-75 hover:bg-[var(--nfs-bg-muted)] border border-dashed border-[var(--nfs-border)] bg-[var(--nfs-bg)] p-8 text-center text-inherit [border-radius:var(--nfs-radius)] data-[drag-active=true]:border-[var(--nfs-color)] data-[drag-active=true]:shadow-[0_0_0_1px_var(--nfs-color)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nfs-color)]',
        error,
        status: 'text-[var(--nfs-text-muted)]',
    }),
    filesList: createFilesTheme({ root: stack, list, item, empty, error }),
    filesMultipartUploader: createFilesTheme({ root: stack, list, item, error }),
    filesPreview: createFilesTheme({
        root: `${root} overflow-hidden border border-[var(--nfs-border)] bg-[var(--nfs-bg)] [border-radius:var(--nfs-radius)]`,
        body: 'flex min-h-40 items-center justify-center bg-[color-mix(in_srgb,var(--nfs-bg-muted)_55%,transparent)] p-4',
        caption: 'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--nfs-border)] px-3 py-2.5',
        error,
    }),
    filesSearch: createFilesTheme({ root: stack, list, item, error }),
    filesShareDialog: createFilesTheme({ root, dialog, error }),
    filesTrashBin: createFilesTheme({ root: stack, list, item, empty, error }),
    filesUploadProgress: createFilesTheme({
        root: stack,
        item: 'flex flex-col gap-3',
        row: 'flex min-w-0 flex-wrap items-center justify-between gap-2',
        progress: 'nfs-progress h-2 w-full overflow-hidden border-0 [border-radius:999px]',
        error,
    }),
    filesVersionHistory: createFilesTheme({ root: stack, list, item, empty, error }),
} as const

export interface FilesTheme {
    compoundVariants: never[]
    defaultVariants: {
        color: 'primary'
        size: 'md'
        variant: keyof typeof variants
    }
    slots: Record<string, string>
    variants: {
        color: typeof colors
        size: typeof sizes
        variant: typeof variants
    }
}
