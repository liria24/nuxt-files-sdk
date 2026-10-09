import { ChildProcess } from 'node:child_process'

import { afterEach, expect, test, vi } from 'vite-plus/test'

const utility = vi.hoisted(() => ({
    descendant: false,
    reconciliationOutput: '[]',
    reconciliationError: null as Error | null,
    exec: vi.fn<
        (
            command: string,
            args: string[],
            _options: unknown,
            callback: (error: Error | null, stdout: string, stderr: string) => void,
        ) => void
    >((command, args, _options, callback) =>
        command === 'powershell.exe' && args.some((arg) => arg.includes('-Filter'))
            ? callback(utility.reconciliationError, utility.reconciliationOutput, '')
            : callback(
                  null,
                  command === 'powershell.exe'
                      ? JSON.stringify(utility.descendant ? [{ ProcessId: 123456788, ParentProcessId: 123456789 }] : [])
                      : utility.descendant
                        ? '123456788 123456789'
                        : '',
                  '',
              ),
    ),
}))
vi.mock('node:child_process', async (original) => ({
    ...(await original<typeof import('node:child_process')>()),
    execFile: utility.exec,
}))

import { closeOwnedProcess } from '../utils/fixture'

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
const initialExec = utility.exec.getMockImplementation()!
afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(process, 'platform', platform)
    vi.restoreAllMocks()
    utility.exec.mockClear()
    utility.exec.mockImplementation(initialExec)
    utility.descendant = false
    utility.reconciliationOutput = '[]'
    utility.reconciliationError = null
})

const exitedChild = (exitCode: number | null, signalCode: NodeJS.Signals | null): ChildProcess => {
    const child = new ChildProcess()
    Object.defineProperties(child, {
        pid: { value: 123456789 },
        exitCode: { value: exitCode },
        signalCode: { value: signalCode },
    })
    return child
}
const permissionError = () => Object.assign(new Error('kill EPERM'), { code: 'EPERM' })

test.each([
    { exitCode: 0, signalCode: null },
    { exitCode: null, signalCode: 'SIGTERM' as const },
])(
    '[CLI-003] an exited owned handle is never re-probed or killed through its numeric PID',
    async ({ exitCode, signalCode }) => {
        const child = exitedChild(exitCode, signalCode)
        const probe = vi.spyOn(process, 'kill').mockImplementation(() => {
            throw permissionError()
        })
        const kill = vi.spyOn(child, 'kill')
        await closeOwnedProcess(child)
        expect(probe).not.toHaveBeenCalled()
        expect(kill).not.toHaveBeenCalled()
    },
)

test.each(['captured', 'reported'] as const)(
    '[CLI-003] an exited root does not hide an inaccessible %s descendant',
    async (ownership) => {
        vi.useFakeTimers()
        const child = exitedChild(0, null)
        const probe = vi.spyOn(process, 'kill').mockImplementation(() => {
            throw permissionError()
        })
        utility.descendant = ownership === 'captured'
        utility.reconciliationOutput = JSON.stringify([{ ProcessId: 123456788 }])
        const closing = closeOwnedProcess(
            child,
            ownership === 'reported' ? { reported: new Set([123456788]) } : {},
        ).catch((error: unknown) => error)
        await vi.advanceTimersByTimeAsync(20_000)
        expect(await closing).toMatchObject({
            message: expect.stringContaining('Owned PID 123456788 liveness probe failed: Error: kill EPERM'),
        })
        expect(probe).toHaveBeenCalledWith(123456788, 0)
    },
)

test('[CLI-003] an exited root PID that has been reused is never targeted', async () => {
    const child = exitedChild(0, null)
    const probe = vi.spyOn(process, 'kill').mockReturnValue(true)
    const kill = vi.spyOn(child, 'kill')
    await closeOwnedProcess(child)
    expect(probe).not.toHaveBeenCalled()
    expect(kill).not.toHaveBeenCalled()
})

test('[CLI-003] an ESRCH exit witness permanently retires an owned PID', async () => {
    const probe = vi
        .spyOn(process, 'kill')
        .mockImplementationOnce(() => {
            throw Object.assign(new Error('exited'), { code: 'ESRCH' })
        })
        .mockReturnValue(true)
    await closeOwnedProcess(exitedChild(0, null), { reported: new Set([123456788]) })
    expect(probe).toHaveBeenCalledExactlyOnceWith(123456788, 0)
    expect(utility.exec.mock.calls.some(([command]) => command === 'taskkill')).toBe(false)
})

const windows = () => Object.defineProperty(process, 'platform', { ...platform, value: 'win32' })
const descendantPid = 123456788
const reported = new Set([descendantPid])
const reconciliationCalls = () =>
    utility.exec.mock.calls.filter(
        ([command, args]) => command === 'powershell.exe' && args.some((arg) => arg.includes('-Filter')),
    )

test.each(['captured', 'reported'] as const)(
    '[CLI-003] Windows confirms an inaccessible %s PID has exited before retiring it',
    async (ownership) => {
        windows()
        utility.descendant = ownership === 'captured'
        const probe = vi.spyOn(process, 'kill').mockImplementation(() => {
            throw permissionError()
        })
        await closeOwnedProcess(exitedChild(0, null), ownership === 'reported' ? { reported } : {})
        expect(probe).toHaveBeenCalledExactlyOnceWith(descendantPid, 0)
        expect(reconciliationCalls()).toHaveLength(1)
        expect(utility.exec.mock.calls.some(([command]) => command === 'taskkill')).toBe(false)
    },
)

test.each(['captured', 'reported'] as const)(
    '[CLI-003] Windows waits for an inaccessible %s PID to disappear within the cleanup deadline',
    async (ownership) => {
        windows()
        vi.useFakeTimers()
        utility.descendant = ownership === 'captured'
        utility.reconciliationOutput = JSON.stringify([{ ProcessId: descendantPid }])
        const exec = utility.exec.getMockImplementation()!
        utility.exec.mockImplementation((command, args, options, callback) => {
            exec(command, args, options, callback)
            if (args.some((arg) => arg.includes('-Filter'))) utility.reconciliationOutput = '[]'
        })
        const probe = vi.spyOn(process, 'kill').mockImplementation(() => {
            throw permissionError()
        })
        const closing = closeOwnedProcess(exitedChild(0, null), ownership === 'reported' ? { reported } : {})
        await vi.advanceTimersByTimeAsync(100)
        await closing
        expect(probe).toHaveBeenCalledTimes(2)
        expect(reconciliationCalls()).toHaveLength(2)
        expect(utility.exec.mock.calls.some(([command]) => command === 'taskkill')).toBe(false)
    },
)

test.each(['captured', 'reported'] as const)(
    '[CLI-003] Windows preserves a genuine inaccessible %s PID failure',
    async (ownership) => {
        windows()
        vi.useFakeTimers()
        utility.descendant = ownership === 'captured'
        utility.reconciliationOutput = JSON.stringify([{ ProcessId: descendantPid }])
        vi.spyOn(process, 'kill').mockImplementation(() => {
            throw permissionError()
        })
        const closing = closeOwnedProcess(exitedChild(0, null), ownership === 'reported' ? { reported } : {}).catch(
            (error: unknown) => error,
        )
        await vi.advanceTimersByTimeAsync(20_000)
        expect(await closing).toMatchObject({
            message: expect.stringContaining('exit reconciliation budget exhausted'),
        })
        expect(reconciliationCalls().length).toBeGreaterThan(1)
        expect(utility.exec.mock.calls.some(([command]) => command === 'taskkill')).toBe(false)
    },
)

test('[CLI-003] Windows fallback cannot restart an inaccessible PID observation budget', async () => {
    windows()
    vi.useFakeTimers()
    utility.descendant = true
    const child = exitedChild(null, null)
    vi.spyOn(child, 'kill').mockReturnValue(true)
    vi.spyOn(process, 'kill').mockImplementation(() => {
        throw permissionError()
    })
    const closing = closeOwnedProcess(child).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await closing).toMatchObject({ message: expect.stringContaining('exit reconciliation budget exhausted') })
    expect(reconciliationCalls()).toHaveLength(0)
    expect(utility.exec.mock.calls.some(([command]) => command === 'taskkill')).toBe(false)
})

test.each(['not-json', 'null', '[{"ProcessId":999}]'])(
    '[CLI-003] malformed Windows exit evidence cannot hide a permission failure: %s',
    async (output) => {
        windows()
        utility.reconciliationOutput = output
        vi.spyOn(process, 'kill').mockImplementation(() => {
            throw permissionError()
        })
        await expect(closeOwnedProcess(exitedChild(0, null), { reported })).rejects.toThrow(
            'exit reconciliation failed',
        )
    },
)

test('[CLI-003] a failed Windows query cannot hide a permission failure', async () => {
    windows()
    utility.reconciliationError = new Error('CIM query denied')
    vi.spyOn(process, 'kill').mockImplementation(() => {
        throw permissionError()
    })
    await expect(closeOwnedProcess(exitedChild(0, null), { reported })).rejects.toThrow('CIM query denied')
})

test('[CLI-003] a retired Windows PID is never re-adopted when the number reappears', async () => {
    windows()
    const probe = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw permissionError()
    })
    const exec = utility.exec.getMockImplementation()!
    utility.exec.mockImplementation((command, args, options, callback) => {
        exec(command, args, options, callback)
        if (args.some((arg) => arg.includes('-Filter')))
            utility.reconciliationOutput = JSON.stringify([{ ProcessId: descendantPid }])
    })
    await closeOwnedProcess(exitedChild(0, null), { reported })
    expect(probe).toHaveBeenCalledExactlyOnceWith(descendantPid, 0)
    expect(reconciliationCalls()).toHaveLength(1)
    expect(utility.exec.mock.calls.some(([command]) => command === 'taskkill')).toBe(false)
    utility.exec.mockImplementation(exec)
})
