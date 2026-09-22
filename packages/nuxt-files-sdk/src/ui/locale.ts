export interface FilesMessages {
    common: {
        actions: string
        cancel: string
        confirm: string
        delete: string
        download: string
        error: string
        fileCount: string
        loading: string
        noPreview: string
        unknownType: string
    }
    dropzone: {
        addFiles: string
        folderPrompt: string
        filePrompt: string
        invalidCount: string
        invalidSize: string
        invalidType: string
        uploadFailed: string
        uploadsFailed: string
        uploaded: string
        uploadedMany: string
        uploading: string
    }
    list: { empty: string; refresh: string }
    browser: { empty: string; loadMore: string; root: string }
    search: {
        caseInsensitive: string
        matches: string
        placeholder: string
        search: string
    }
    multipart: {
        addFiles: string
        automaticParts: string
        cancel: string
        cancelled: string
        upload: string
        uploading: string
    }
    share: {
        attachment: string
        copied: string
        copy: string
        expiresAfter: string
        generate: string
        inline: string
        openAs: string
        permanent: string
        titleDownload: string
        titleUpload: string
    }
    actions: {
        copy: string
        copyTo: string
        delete: string
        deleteFile: string
        destination: string
        move: string
        moveTo: string
        newName: string
        rename: string
        renameFile: string
    }
    capabilities: Record<
        | 'cacheControl'
        | 'delimiter'
        | 'metadata'
        | 'multipart'
        | 'rangeRead'
        | 'serverSideCopy'
        | 'signedUrl'
        | 'uploadProgress',
        string
    >
    versions: { empty: string; latest: string; restore: string }
    trash: {
        deleteForever: string
        empty: string
        emptyAction: string
        emptyConfirm: string
        itemConfirm: string
        restore: string
        summary: string
    }
}

export interface FilesLocale {
    name: string
    code: string
    dir: 'ltr' | 'rtl'
    messages: { files: FilesMessages }
}

interface LocaleLike {
    name: string
    code: string
    dir: 'ltr' | 'rtl'
    messages: Record<string, unknown>
}

export type WithFilesLocale<T extends LocaleLike> = Omit<T, 'messages'> & {
    messages: T['messages'] & FilesLocale['messages']
}

export const en: FilesLocale = {
    name: 'English',
    code: 'en',
    dir: 'ltr',
    messages: {
        files: {
            common: {
                actions: 'Actions',
                cancel: 'Cancel',
                confirm: 'Confirm',
                delete: 'Delete',
                download: 'Download',
                error: 'Something went wrong.',
                fileCount: '{count} files',
                loading: 'Loading…',
                noPreview: 'No inline preview',
                unknownType: 'unknown',
            },
            dropzone: {
                addFiles: 'Upload files',
                filePrompt: 'Drag & drop or click to upload',
                folderPrompt: 'Drag & drop a folder or click to upload',
                invalidCount: 'Select at most {count} files.',
                invalidSize: '“{name}” exceeds the {size} size limit.',
                invalidType: '“{name}” is not an accepted file type.',
                uploadFailed: 'Upload failed: {failures}',
                uploadsFailed: '{count} uploads failed: {failures}',
                uploaded: 'Uploaded {name}',
                uploadedMany: '{count} files uploaded',
                uploading: 'Uploading…',
            },
            list: { empty: 'Nothing here yet.', refresh: 'Refresh files' },
            browser: { empty: 'This folder is empty.', loadMore: 'Load more', root: 'Root' },
            search: {
                caseInsensitive: 'Case-insensitive',
                matches: '{count} matches',
                placeholder: 'Search keys…',
                search: 'Search',
            },
            multipart: {
                addFiles: 'Add files',
                automaticParts: 'Large files upload in parts automatically.',
                cancel: 'Cancel',
                cancelled: 'Cancelled',
                upload: 'Upload {count} files',
                uploading: 'Uploading…',
            },
            share: {
                attachment: 'Download',
                copied: 'Copied',
                copy: 'Copy',
                expiresAfter: 'Expires after',
                generate: 'Generate link',
                inline: 'Inline',
                openAs: 'Open as',
                permanent: "This adapter can't sign URLs, so the link is permanent and ignores the expiry.",
                titleDownload: 'Share link',
                titleUpload: 'Upload link',
            },
            actions: {
                copy: 'Copy',
                copyTo: 'Copy to',
                delete: 'Delete',
                deleteFile: 'Delete file',
                destination: 'Destination key',
                move: 'Move',
                moveTo: 'Move to',
                newName: 'New name',
                rename: 'Rename',
                renameFile: 'Rename file',
            },
            capabilities: {
                cacheControl: 'Cache-Control',
                delimiter: 'Folder listing',
                metadata: 'Custom metadata',
                multipart: 'Multipart uploads',
                rangeRead: 'Range reads',
                serverSideCopy: 'Server-side copy',
                signedUrl: 'Signed URLs',
                uploadProgress: 'Upload progress',
            },
            versions: { empty: 'No version history yet.', latest: 'latest', restore: 'Restore' },
            trash: {
                deleteForever: 'Delete forever',
                empty: 'Trash is empty.',
                emptyAction: 'Empty trash',
                emptyConfirm: "Every item in the trash will be permanently deleted. This can't be undone.",
                itemConfirm: '"{key}" will be permanently deleted. This cannot be undone.',
                restore: 'Restore',
                summary: '{count} in trash',
            },
        },
    },
}

export const withFilesLocale = <T extends LocaleLike>(
    locale: T,
    filesLocale: FilesLocale = en,
): WithFilesLocale<T> => ({
    ...locale,
    messages: { ...locale.messages, ...filesLocale.messages },
})

export const withFilesLocales = <const T extends Readonly<Record<string, LocaleLike>>>(
    locales: T,
    filesLocale: FilesLocale = en,
): { [K in keyof T]: WithFilesLocale<T[K]> } =>
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.fromEntries cannot preserve mapped namespace keys
    Object.fromEntries(Object.entries(locales).map(([key, locale]) => [key, withFilesLocale(locale, filesLocale)])) as {
        [K in keyof T]: WithFilesLocale<T[K]>
    }
