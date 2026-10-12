import type { TestContext } from 'vite-plus/test'

export interface ConsumerSession {
    signal: AbortSignal
    startVerification(this: void): void
    stage<T>(this: void, name: string, operation: () => Promise<T>, cleanup?: boolean): Promise<T>
}

export const consumerPhaseBudget = 300_000
export const consumerSessionBudget = consumerPhaseBudget * 2

/** Drain cancellation before suite teardown can remove a still-used consumer directory. */
export const withConsumerSession = <T>(
    context: Pick<TestContext, 'signal' | 'onTestFinished'>,
    label: string,
    operation: (session: ConsumerSession) => Promise<T>,
    budgets: { installation: number; verification: number } = {
        installation: consumerPhaseBudget,
        verification: consumerPhaseBudget,
    },
): Promise<T> => {
    const deadline = new AbortController()
    const signal = AbortSignal.any([context.signal, deadline.signal])
    let verifying = false
    const arm = (phase: string, budget: number) => {
        if (!Number.isFinite(budget) || budget <= 0)
            throw new Error('Consumer phase budget must be finite and positive')
        const timer = setTimeout(() => deadline.abort(new Error(`Consumer ${phase} exceeded ${budget}ms`)), budget)
        timer.unref()
        return timer
    }
    let timer = arm('installation', budgets.installation)
    const started = Date.now()
    const progress = (stage: string, phase: string) => {
        // oxlint-disable-next-line no-console
        console.info('[Packed consumer stage]', JSON.stringify({ label, stage, phase, ms: Date.now() - started }))
    }
    const session: ConsumerSession = {
        signal,
        startVerification() {
            signal.throwIfAborted()
            if (verifying) throw new Error('Consumer verification budget already started')
            verifying = true
            clearTimeout(timer)
            timer = arm('verification', budgets.verification)
        },
        async stage(name, run, cleanup = false) {
            if (!cleanup) signal.throwIfAborted()
            progress(name, 'start')
            try {
                const result = await run()
                // Return owned resources to their caller before the next cancellation check.
                // Throwing here can strand a just-created server before its finally block.
                progress(name, signal.aborted && !cleanup ? 'cancelled' : 'complete')
                return result
            } catch (error) {
                progress(name, signal.aborted ? 'cancelled' : 'failed')
                throw error
            }
        },
    }
    const work = Promise.resolve()
        .then(() => operation(session))
        .then((result) => {
            signal.throwIfAborted()
            return result
        })
        .catch((error: unknown) => {
            if (deadline.signal.aborted)
                throw new AggregateError(
                    [deadline.signal.reason, error],
                    `${String(deadline.signal.reason)}: ${String(error)}`,
                )
            throw error
        })
        .finally(() => clearTimeout(timer))
    context.onTestFinished(async () => {
        try {
            await work
        } catch (error) {
            // A timeout settles the test before owned cleanup completes. Preserve that late
            // rejection too, so failed shutdown or surviving processes remain visible.
            if (signal.aborted) throw error
        }
    })
    return work
}
