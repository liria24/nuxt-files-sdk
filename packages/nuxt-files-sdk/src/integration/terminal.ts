import type { NuxtTerminal } from '@nuxt/kit'

/** Short work is quiet. A visible task always terminates with its actual outcome. */
export const withFilesTask = async <T>(
    terminal: Pick<NuxtTerminal, 'startTask'>,
    label: string,
    work: () => Promise<T>,
    delay = 500,
): Promise<T> => {
    let task: ReturnType<NuxtTerminal['startTask']> | undefined
    let outcome: 'success' | 'failure' = 'failure'
    const timer = setTimeout(() => {
        task = terminal.startTask(label)
    }, delay)
    timer.unref()
    try {
        const result = await work()
        outcome = 'success'
        return result
    } finally {
        clearTimeout(timer)
        task?.stop(undefined, outcome)
    }
}
