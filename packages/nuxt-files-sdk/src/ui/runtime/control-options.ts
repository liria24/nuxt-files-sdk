import type { FilesAction } from './actions'
import type { FilesClassValue, FilesColor, FilesSize, FilesUi, FilesVariant } from './theme'
import type { FilesUiProps } from './theme'

interface ControlStyle {
    class?: FilesClassValue
    color?: FilesColor
    size?: FilesSize
    ui?: FilesUi
    variant?: FilesVariant
}

export interface FilesButtonOptions extends ControlStyle {
    ariaLabel?: string
    disabled?: boolean
    icon?: string
    label?: string
    loading?: boolean
}

export interface FilesInputOptions extends Omit<ControlStyle, 'variant'> {
    disabled?: boolean
    placeholder?: string
    variant?: 'ghost' | 'none' | 'outline' | 'soft' | 'subtle'
}

export interface FilesSelectOptions extends Omit<ControlStyle, 'variant'> {
    disabled?: boolean
    variant?: 'ghost' | 'none' | 'outline' | 'soft' | 'subtle'
}

export interface FilesCheckboxOptions extends Omit<ControlStyle, 'variant'> {
    disabled?: boolean
    label?: string
    variant?: 'card' | 'list'
}

export interface FilesProgressOptions extends Omit<ControlStyle, 'variant'> {}

export interface FilesMenuItemOptions {
    class?: FilesClassValue
    disabled?: boolean
    icon?: string
    label?: string
}

export interface FilesActionControls {
    cancel?: FilesButtonOptions
    confirm?: FilesButtonOptions
    input?: FilesInputOptions
    items?: Partial<Record<FilesAction, FilesMenuItemOptions>>
    trigger?: FilesButtonOptions
}

export interface FilesComponentControls {
    filesActions: FilesActionControls
    filesBrowser: {
        home?: FilesButtonOptions
        breadcrumb?: FilesButtonOptions
        refresh?: FilesButtonOptions
        folder?: FilesButtonOptions
        file?: FilesButtonOptions
        loadMore?: FilesButtonOptions
        fileActions?: FilesActionControls
    }
    filesCapabilities: object
    filesDropzone: { trigger?: FilesButtonOptions }
    filesList: {
        refresh?: FilesButtonOptions
        file?: FilesButtonOptions
        loadMore?: FilesButtonOptions
        fileActions?: FilesActionControls
    }
    filesMultipartUploader: { choose?: FilesButtonOptions; upload?: FilesButtonOptions; cancel?: FilesButtonOptions }
    filesPreview: object
    filesSearch: {
        query?: FilesInputOptions
        submit?: FilesButtonOptions
        match?: FilesSelectOptions
        caseInsensitive?: FilesCheckboxOptions
        result?: FilesButtonOptions
    }
    filesShareDialog: {
        trigger?: FilesButtonOptions
        expiryInput?: FilesInputOptions
        dispositionSelect?: FilesSelectOptions
        urlInput?: FilesInputOptions
        copy?: FilesButtonOptions
        cancel?: FilesButtonOptions
        submit?: FilesButtonOptions
    }
    filesTrashBin: {
        purgeAll?: FilesButtonOptions
        restore?: FilesButtonOptions
        purge?: FilesButtonOptions
        confirm?: FilesButtonOptions
        cancel?: FilesButtonOptions
    }
    filesUploadProgress: { aggregate?: FilesProgressOptions; item?: FilesProgressOptions }
    filesVersionHistory: { restore?: FilesButtonOptions }
}

export type FilesThemeProps = { [Name in keyof FilesComponentControls]?: FilesUiProps & FilesComponentControls[Name] }
