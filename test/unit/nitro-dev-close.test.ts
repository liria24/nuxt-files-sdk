import { expect, test, vi } from 'vitest'

import { stopNitroDevReloadOnClose } from '../../packages/nuxt-files-sdk/src/integration/nitro-dev-close'

test('native development reload remains active until close, then late builds cannot dispatch it', async () => {
    const worker = vi.fn<() => void>()
    const observer = vi.fn<() => void>()
    const reload = new Set<() => void>([worker, observer])
    const close: (() => unknown)[] = []
    const hooks = {
        hook: (_name: 'close', callback: () => unknown) => close.push(callback),
        callHookWith: (caller: (callbacks: (() => void)[]) => unknown, _name: 'dev:reload') => caller([...reload]),
        removeHook: (_name: 'dev:reload', callback: () => void) => reload.delete(callback),
    }
    stopNitroDevReloadOnClose({ hooks })
    const dispatch = () => {
        for (const callback of reload) callback()
    }
    dispatch()
    expect(worker).toHaveBeenCalledTimes(1)
    expect(observer).toHaveBeenCalledTimes(1)
    close.push(dispatch)
    for (const callback of close) await callback()
    dispatch()
    expect(worker).toHaveBeenCalledTimes(1)
    expect(observer).toHaveBeenCalledTimes(1)
})

test('an unavailable native development hook surface creates no replacement hooks', () => {
    const hook = vi.fn<() => void>()
    for (const value of [undefined, {}, { hooks: { hook } }]) stopNitroDevReloadOnClose(value)
    expect(hook).not.toHaveBeenCalled()
})
