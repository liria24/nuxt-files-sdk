/** Called only after shutdown replied null, exit was sent, and the owned server closed naturally. */
export const checkLspExit = (
    status: { code: number | null; signal: NodeJS.Signals | null },
    stderr: string,
    version: string,
): boolean => {
    const diagnostic = stderr.trim()
    if (status.signal === null && status.code === 0 && !diagnostic) return false
    // v7.0.2 cancels its dispatch queue on exit, then reports context.Canceled as an error.
    // https://github.com/microsoft/TypeScript/blob/v7.0.2/tsc/internal/lsp/server.go#L532-L590
    if (version === '7.0.2' && status.signal === null && status.code === 1 && diagnostic === 'context canceled')
        return true
    throw new Error(`TypeScript ${version} language server exit=${status.code}, signal=${status.signal}.\n${stderr}`)
}
