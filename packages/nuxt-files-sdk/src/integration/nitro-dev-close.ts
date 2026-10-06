type ReloadCallback = (...args: unknown[]) => unknown
interface DevelopmentHooks {
    hook(name: 'close', callback: () => unknown): unknown
    callHookWith(caller: (callbacks: ReloadCallback[]) => unknown, name: 'dev:reload'): unknown
    removeHook(name: 'dev:reload', callback: ReloadCallback): unknown
}

/** Stop late Nitro 2 build events from recreating a development worker during Nuxt shutdown. */
export const stopNitroDevReloadOnClose = (instance: unknown): void => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const hooks = (instance as { hooks?: Partial<DevelopmentHooks> } | undefined)?.hooks
    if (
        typeof hooks?.hook !== 'function' ||
        typeof hooks.callHookWith !== 'function' ||
        typeof hooks.removeHook !== 'function'
    )
        return
    const callHookWith = hooks.callHookWith.bind(hooks)
    const removeHook = hooks.removeHook.bind(hooks)
    hooks.hook('close', () =>
        callHookWith((callbacks) => {
            for (const callback of callbacks) removeHook('dev:reload', callback)
        }, 'dev:reload'),
    )
}
