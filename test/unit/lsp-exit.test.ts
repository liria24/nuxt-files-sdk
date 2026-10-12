import { expect, test } from 'vite-plus/test'

import { checkLspExit } from '../utils/lsp-exit'

test('[LSP-002] successful native closure is accepted', () => {
    expect(checkLspExit({ code: 0, signal: null }, '', '7.0.2')).toBe(false)
})

test('[LSP-002] only the versioned cancellation diagnostic is a known native exit', () => {
    expect(checkLspExit({ code: 1, signal: null }, 'context canceled\r\n', '7.0.2')).toBe(true)
})

test.for([
    [{ code: 1, signal: null }, 'context canceled\nother failure', '7.0.2'],
    [{ code: 1, signal: null }, '', '7.0.2'],
    [{ code: 1, signal: null }, 'context canceled', '7.0.3'],
    [{ code: 2, signal: null }, 'context canceled', '7.0.2'],
    [{ code: null, signal: 'SIGTERM' }, 'context canceled', '7.0.2'],
    [{ code: 0, signal: null }, 'other failure', '7.0.2'],
] as const)('[LSP-002] unexpected native closure %# remains a failure', ([status, stderr, version]) => {
    expect(() => checkLspExit(status, stderr, version)).toThrow('language server exit=')
})
