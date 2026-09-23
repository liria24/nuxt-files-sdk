const root = 'nfs-root box-border min-w-0 leading-5'
const stack = `${root} flex flex-col gap-3`
const list = 'm-0 flex list-none flex-col gap-2 p-0'
const item =
    'flex min-w-0 flex-wrap items-center gap-3 border border-[var(--nfs-border)] bg-[var(--nfs-bg)] p-2 [border-radius:var(--nfs-radius)]'
const empty = 'flex min-h-32 flex-col items-center justify-center gap-2 text-center text-[var(--nfs-text-muted)]'
const error = 'text-[var(--nfs-error)]'
const dialog =
    'nfs-root fixed start-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto border border-[var(--nfs-border)] bg-[var(--nfs-bg)] p-4 text-[var(--nfs-text)] shadow-2xl [border-radius:var(--nfs-radius)]'

export const createFilesTheme = <const Slots extends { root: string }>(slots: Slots) => ({ slots })

export const filesThemes = {
    filesActions: createFilesTheme({
        root: `${root} inline-flex shrink-0`,
        trigger: '',
        menu: `${root} z-50 min-w-40 border border-[var(--nfs-border)] bg-[var(--nfs-bg)] p-1 shadow-xl [border-radius:var(--nfs-radius)]`,
        dialog,
        error,
    }),
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
    filesTrashBin: createFilesTheme({ root: stack, list, item, empty, dialog, error }),
    filesUploadProgress: createFilesTheme({
        root: stack,
        item: 'flex flex-col gap-3',
        row: 'flex min-w-0 flex-wrap items-center justify-between gap-2',
        progress: 'w-full overflow-hidden [border-radius:999px]',
        error,
    }),
    filesVersionHistory: createFilesTheme({ root: stack, list, item, empty, error }),
} as const

export interface FilesTheme {
    slots: Record<string, string>
}
