import { expect, test, vi, type TestContext } from 'vite-plus/test'

import { withConsumerSession } from '../utils/consumer-session'

test('[CLI-006] slow installation leaves a fresh finite verification budget', async (context) => {
    vi.useFakeTimers()
    const installed = Promise.withResolvers<void>()
    const verified = Promise.withResolvers<void>()
    let signal: AbortSignal | undefined
    const work = withConsumerSession(
        context,
        'phase budgets',
        async (session) => {
            signal = session.signal
            await installed.promise
            session.startVerification()
            await verified.promise
        },
        { installation: 100, verification: 100 },
    )
    try {
        await vi.advanceTimersByTimeAsync(90)
        installed.resolve()
        await vi.advanceTimersByTimeAsync(90)
        expect(signal!.aborted).toBe(false)
        verified.resolve()
        await work
        await vi.advanceTimersByTimeAsync(1000)
        expect(signal!.aborted).toBe(false)
    } finally {
        installed.resolve()
        verified.resolve()
        vi.useRealTimers()
    }
})

test.for(['installation', 'verification'] as const)(
    '[CLI-006] %s expiry cancels and drains work',
    async (phase, context) => {
        vi.useFakeTimers()
        const cleanup = Promise.withResolvers<void>()
        const finished = vi.fn<TestContext['onTestFinished']>()
        let drained = false
        const work = withConsumerSession(
            { signal: context.signal, onTestFinished: finished },
            'phase expiry',
            async (session) => {
                if (phase === 'verification') session.startVerification()
                try {
                    await new Promise<void>((_, reject) =>
                        session.signal.addEventListener('abort', () => reject(session.signal.reason), { once: true }),
                    )
                } finally {
                    await session.stage('owned cleanup', () => cleanup.promise, true)
                    drained = true
                }
            },
            { installation: 100, verification: 100 },
        )
        const outcome = work.catch((error: unknown) => error)
        try {
            await vi.advanceTimersByTimeAsync(101)
            expect(drained).toBe(false)
            cleanup.resolve()
            expect(String(await outcome)).toContain(`Consumer ${phase} exceeded 100ms`)
            expect(drained).toBe(true)
            await expect(finished.mock.calls[0]![0](context)).rejects.toThrow(`Consumer ${phase} exceeded 100ms`)
        } finally {
            cleanup.resolve()
            await outcome
            vi.useRealTimers()
        }
    },
)

test('[CLI-006] verification budget cannot be renewed repeatedly', async (context) => {
    await expect(
        withConsumerSession(context, 'single transition', async (session) => {
            session.startVerification()
            session.startVerification()
        }),
    ).rejects.toThrow('already started')
})
