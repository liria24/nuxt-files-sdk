import type { TestContext } from 'vite-plus/test'

export interface ConsumerSession {
    signal: AbortSignal
    stage<T>(this: void, name: string, operation: () => Promise<T>, cleanup?: boolean): Promise<T>
}

/** Drain cancellation before suite teardown can remove a still-used consumer directory. */
export const withConsumerSession = <T>(
    context: Pick<TestContext, 'signal' | 'onTestFinished'>,
    label: string,
    operation: (session: ConsumerSession) => Promise<T>,
): Promise<T> => {
    const started = Date.now()
    const progress = (stage: string, phase: string) => {
        // oxlint-disable-next-line no-console
        console.info('[Packed consumer stage]', JSON.stringify({ label, stage, phase, ms: Date.now() - started }))
    }
    const session: ConsumerSession = {
        signal: context.signal,
        async stage(name, run, cleanup = false) {
            if (!cleanup) context.signal.throwIfAborted()
            progress(name, 'start')
            try {
                const result = await run()
                // Return owned resources to their caller before the next cancellation check.
                // Throwing here can strand a just-created server before its finally block.
                progress(name, context.signal.aborted && !cleanup ? 'cancelled' : 'complete')
                return result
            } catch (error) {
                progress(name, context.signal.aborted ? 'cancelled' : 'failed')
                throw error
            }
        },
    }
    const work = Promise.resolve()
        .then(() => operation(session))
        .then((result) => {
            context.signal.throwIfAborted()
            return result
        })
    context.onTestFinished(async () => {
        try {
            await work
        } catch (error) {
            // A timeout settles the test before owned cleanup completes. Preserve that late
            // rejection too, so failed shutdown or surviving processes remain visible.
            if (context.signal.aborted) throw error
        }
    })
    return work
}
