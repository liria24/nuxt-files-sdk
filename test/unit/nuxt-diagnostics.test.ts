import { expect, test, vi } from 'vite-plus/test'

const command = vi.hoisted(() =>
    vi.fn<(...args: unknown[]) => Promise<string>>(async () => 'pnpm add "@aws-sdk/client-s3@^3"'),
)
vi.mock('@nuxt/kit', () => ({ getAddDependencyCommand: command }))

import type { DependencyDiagnostic } from '../../packages/nuxt-files-sdk/src/integration/diagnostics'
import { reportNuxtDependencyIssues } from '../../packages/nuxt-files-sdk/src/integration/nuxt-diagnostics'

test('Nuxt peer advice uses production dependency commands without prompts or installation', async () => {
    const warn = Object.assign(vi.fn<(message: unknown) => void>(), { raw: vi.fn<() => void>() })
    const previous = new Set<string>()
    const missing: DependencyDiagnostic = {
        dependency: '@aws-sdk/client-s3',
        subpath: 'files-sdk/s3',
        necessity: 'required',
        status: 'missing',
        range: '^3',
        conditions: ['node', 'import'],
        reason: 'adapter',
        stage: 'import',
    }
    await reportNuxtDependencyIssues([missing], previous, { warn }, '/consumer')
    expect(command).toHaveBeenCalledExactlyOnceWith(['@aws-sdk/client-s3@^3'], '/consumer', { dev: false })
    expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Run: pnpm add'))
    await reportNuxtDependencyIssues([missing], previous, { warn }, '/consumer')
    expect(command).toHaveBeenCalledTimes(1)
    await reportNuxtDependencyIssues([{ ...missing, status: 'unknown' }], previous, { warn }, '/consumer')
    expect(warn).toHaveBeenCalledTimes(1)
})
