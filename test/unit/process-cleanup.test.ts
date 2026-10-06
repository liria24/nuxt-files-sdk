import { ChildProcess } from 'node:child_process'

import { afterEach, expect, test, vi } from 'vitest'

const utility = vi.hoisted(() => ({
    descendant: false,
    exec: vi.fn<
        (
            command: string,
            _args: string[],
            _options: unknown,
            callback: (error: null, stdout: string, stderr: string) => void,
        ) => void
    >((command, _args, _options, callback) =>
        callback(
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

afterEach(() => {
    vi.restoreAllMocks()
    utility.exec.mockClear()
    utility.descendant = false
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
        const child = exitedChild(0, null)
        const probe = vi.spyOn(process, 'kill').mockImplementation(() => {
            throw permissionError()
        })
        utility.descendant = ownership === 'captured'
        await expect(
            closeOwnedProcess(child, ownership === 'reported' ? { reported: new Set([123456788]) } : {}),
        ).rejects.toThrow('Owned PID 123456788 liveness probe failed: Error: kill EPERM')
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
