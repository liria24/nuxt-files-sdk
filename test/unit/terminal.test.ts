import { expect, test, vi } from 'vite-plus/test'

import { withFilesTask } from '../../packages/nuxt-files-sdk/src/integration/terminal'

test('[CLI-001] short work is quiet and long work ends its task on success and failure', async () => {
    vi.useFakeTimers()
    const stop = vi.fn<(message?: string, outcome?: 'success' | 'failure') => void>()
    const terminal = {
        startTask: vi.fn<() => { stop: typeof stop; update: () => void }>(() => ({
            stop,
            update: vi.fn<() => void>(),
        })),
    }
    try {
        await expect(withFilesTask(terminal, 'Files configuration', async () => 1)).resolves.toBe(1)
        await vi.advanceTimersByTimeAsync(1000)
        expect(terminal.startTask).not.toHaveBeenCalled()
        for (const failed of [false, true]) {
            const error = new Error('native config failure')
            let finish!: () => void
            const pending = new Promise<void>((done) => {
                finish = done
            })
            const run = withFilesTask(terminal, 'Files configuration', async () => {
                await pending
                if (failed) throw error
            })
            const settled = run.then(
                () => undefined,
                (failure: unknown) => failure,
            )
            await vi.advanceTimersByTimeAsync(500)
            finish()
            expect(await settled).toBe(failed ? error : undefined)
            expect(stop).toHaveBeenLastCalledWith(undefined, failed ? 'failure' : 'success')
        }
        expect(vi.getTimerCount()).toBe(0)
    } finally {
        vi.useRealTimers()
    }
})
