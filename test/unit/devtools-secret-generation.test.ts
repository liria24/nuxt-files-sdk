import type { Nuxt } from '@nuxt/schema'
import { expect, test, vi } from 'vitest'

const generated = vi.hoisted(() => [] as string[])
vi.mock('@nuxt/kit', () => ({
    addTemplate: (input: { filename: string; getContents: () => string }) => {
        generated.push(input.getContents())
        return { dst: `/tmp/${input.filename}` }
    },
    addServerHandler: (_input: unknown) => {},
    addDevServerHandler: (_input: unknown) => {},
}))

import { setupFilesDevtools } from '../../packages/nuxt-files-sdk/src/devtools'

test('DevTools worker templates reference a separate runtime token without embedding its value', async () => {
    const token = 'PRIVATE_DEVTOOLS_RUNTIME_CANARY_2026'
    const nuxt = { hook: (_name: string, _callback: unknown) => {} } as unknown as Nuxt
    await setupFilesDevtools(nuxt, '4', false, { token, environmentKey: 'NUXT_FILES_DEVTOOLS_FIXTURE' })
    expect(generated).toHaveLength(2)
    expect(generated.join('\n')).not.toContain(token)
    expect(generated.join('\n')).toContain('process.env["NUXT_FILES_DEVTOOLS_FIXTURE"]')
    expect(generated.join('\n')).toContain("from 'nuxt/server'")
})
