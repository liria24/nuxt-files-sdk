import { describe, expect, test, vi } from 'vitest'

import {
    authorizeFilesDevtoolsRequest,
    createFilesDevtoolsToken,
    FILES_DEVTOOLS_TOKEN_TTL,
    verifyFilesDevtoolsToken,
} from '../../packages/nuxt-files-sdk/src/devtools/auth'
import snapshot from '../../packages/nuxt-files-sdk/src/devtools/snapshot'
import tokenHandler from '../../packages/nuxt-files-sdk/src/devtools/token'
import { configureFiles, inspectFiles } from '../../packages/nuxt-files-sdk/src/runtime/internal'

describe('Files DevTools HTTP authentication', () => {
    test('[SEC-005] issues tokens only after native v3 authorization succeeds', async () => {
        const authorize = vi.fn<(token: string) => Promise<void>>(async (token) => {
            if (token !== 'native-token') throw new Error('Unauthorized')
        })
        const request = (headers: Record<string, string>) =>
            tokenHandler({ node: { req: { headers } } }, 'test-secret', authorize)
        expect((await request({})).status).toBe(401)
        expect((await request({ 'x-nuxt-files-sdk-bootstrap': 'public-tab-value' })).status).toBe(401)
        expect(authorize).not.toHaveBeenCalled()
        expect((await request({ 'x-nuxt-devtools-token': 'invalid' })).status).toBe(401)
        const response = await request({ 'x-nuxt-devtools-token': 'native-token' })
        expect(response.status).toBe(200)
        const { token } = (await response.json()) as { token: string }
        await expect(verifyFilesDevtoolsToken(token, 'test-secret')).resolves.toBe(true)
    })
    test('enriches runtime diagnostic codes only in the authenticated development snapshot', async () => {
        const registry = configureFiles(
            { storage: { adapter: 'memory' } },
            {
                factories: {
                    memory: () => {
                        throw new Error('private provider details')
                    },
                },
            },
        )
        expect(() => registry.get()).toThrow('private provider details')
        expect(inspectFiles().diagnostics).toEqual([{ code: 'NUXT_FILES_ADAPTER_INIT_FAILED', adapter: 'memory' }])
        const { token } = await createFilesDevtoolsToken('snapshot-secret')
        const response = await snapshot(
            { node: { req: { headers: new Headers({ authorization: `Bearer ${token}` }) } } },
            'snapshot-secret',
        )
        const body = await response.text()
        expect(body).not.toContain('private provider details')
        expect(JSON.parse(body).diagnostics).toEqual([
            expect.objectContaining({
                code: 'NUXT_FILES_ADAPTER_INIT_FAILED',
                level: 'error',
                message: 'The single storage (memory) could not be initialized.',
                hint: expect.any(String),
                docs: expect.any(String),
            }),
        ])
    })

    test('[SEC-005] accepts only valid, unexpired bearer tokens', async () => {
        const now = 1_000_000
        const issued = await createFilesDevtoolsToken('test-secret', now)

        await expect(verifyFilesDevtoolsToken(issued.token, 'test-secret', now)).resolves.toBe(true)
        await expect(verifyFilesDevtoolsToken(issued.token, 'wrong-secret', now)).resolves.toBe(false)
        await expect(verifyFilesDevtoolsToken(`${issued.token}x`, 'test-secret', now)).resolves.toBe(false)
        await expect(
            verifyFilesDevtoolsToken(issued.token, 'test-secret', now + FILES_DEVTOOLS_TOKEN_TTL),
        ).resolves.toBe(false)
        await expect(authorizeFilesDevtoolsRequest({ headers: new Headers() }, 'test-secret')).resolves.toBe(false)
        const current = await createFilesDevtoolsToken('test-secret')
        await expect(
            authorizeFilesDevtoolsRequest(
                { headers: new Headers({ authorization: `Bearer ${current.token}` }) },
                'test-secret',
            ),
        ).resolves.toBe(true)
    })
})
