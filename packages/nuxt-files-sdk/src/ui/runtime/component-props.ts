import { useFilesUiContext } from './context'

export const useFilesComponentProps = <T extends object>(name: string, props: T): T =>
    useFilesUiContext().resolveComponentProps?.(name, props) ?? props
