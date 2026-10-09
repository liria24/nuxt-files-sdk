import { createFilesClient } from 'files-sdk/client'
import { memory } from 'files-sdk/memory'
import { r2 } from 'files-sdk/r2'
import { describe, expect, test, vi } from 'vite-plus/test'

import {
    authorizeFilesDevtoolsRequest,
    createFilesDevtoolsToken,
    FILES_DEVTOOLS_TOKEN_TTL,
    verifyFilesDevtoolsToken,
} from '../../packages/nuxt-files-sdk/src/devtools/auth'
import { createFilesDevtoolsHandler } from '../../packages/nuxt-files-sdk/src/devtools/files'
import snapshot from '../../packages/nuxt-files-sdk/src/devtools/snapshot'
import tokenHandler from '../../packages/nuxt-files-sdk/src/devtools/token'
import { configureFiles, inspectFiles } from '../../packages/nuxt-files-sdk/src/runtime/internal'

describe('Files DevTools HTTP authentication', () => {
    test('[SEC-004][SEC-005] authenticated read-only gateway exposes metadata and blocks every write path', async () => {
        const registry = configureFiles({ storage: { adapter: 'memory' } }, { factories: { memory } })
        await registry.get().upload('hello.txt', 'hello', { contentType: 'text/plain' })
        const handler = createFilesDevtoolsHandler(false)
        const endpoint = 'http://localhost/__nuxt-files-api/files'
        const secret = 'readonly-test-secret'
        const { token } = await createFilesDevtoolsToken(secret)
        const fetchImpl: typeof fetch = async (input, init) => {
            const req = new Request(input, init)
            return handler({ req, url: new URL(req.url), context: {}, res: { headers: new Headers() } }, secret)
        }
        const unauthorized = createFilesClient({ endpoint, fetchImpl })
        await expect(unauthorized.capabilities()).rejects.toThrow('gateway responded 401')
        const files = createFilesClient({ endpoint, headers: { authorization: `Bearer ${token}` }, fetchImpl })
        expect(await files.capabilities()).toEqual(registry.get().capabilities)
        expect(await files.head('hello.txt')).toMatchObject({ key: 'hello.txt', size: 5, contentType: 'text/plain' })
        expect((await files.head(['hello.txt'])).results).toHaveLength(1)
        expect((await files.list()).items).toHaveLength(1)
        expect(await (await files.download('hello.txt')).text()).toBe('hello')
        await expect(files.delete('hello.txt')).rejects.toMatchObject({ code: 'Unauthorized' })
        for (const body of [
            { op: 'presign', files: [{ name: 'new.txt', size: 3, type: 'text/plain' }] },
            { op: 'complete', completions: [{ id: 'invalid', key: 'new.txt' }] },
            { op: 'signed-upload-url', key: 'new.txt', expiresIn: 300 },
        ]) {
            const response = await fetchImpl(endpoint, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${token}`,
                    origin: 'http://localhost',
                    'content-type': 'application/json',
                },
                body: JSON.stringify(body),
            })
            expect(response.status).toBe(403)
        }
        expect(await registry.get().exists('hello.txt')).toBe(true)
    })
    test('[DEV-005] bounded DevTools uploads use the R2 fetch proxy without optional AWS packages', async () => {
        configureFiles(
            {
                storage: {
                    adapter: 'r2',
                    config: {
                        bucket: 'test',
                        accountId: 'test',
                        accessKeyId: 'test',
                        secretAccessKey: 'test',
                        client: 'fetch',
                    },
                },
            },
            { factories: { r2 } },
        )
        const handler = createFilesDevtoolsHandler(true)
        const secret = 'proxy-test-secret'
        const { token } = await createFilesDevtoolsToken(secret)
        const presign = async (size: number) => {
            const req = new Request('http://localhost/__nuxt-files-api/files', {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${token}`,
                    origin: 'http://localhost',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ op: 'presign', files: [{ name: 'local.txt', size, type: 'text/plain' }] }),
            })
            return handler({ req, url: new URL(req.url), context: {}, res: { headers: new Headers() } }, secret)
        }
        const response = await presign(3)
        expect(response.status).toBe(200)
        const body = (await response.json()) as { uploads: { target: { url: string; method: string } }[] }
        const target = body.uploads[0]!.target
        expect(new URL(target.url).origin).toBe('http://localhost')
        expect(new URL(target.url).pathname).toBe('/__nuxt-files-api/files')
        expect(target.method).toBe('PUT')
        const oversized = await presign(10 * 1024 * 1024 + 1)
        expect(oversized.status).toBe(422)
        expect(await oversized.json()).toMatchObject({ error: { code: 'Validation', reason: 'size' } })
    })
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
        const req = new Request('http://localhost/__nuxt-files-api/snapshot', {
            headers: { authorization: `Bearer ${token}` },
        })
        const response = await snapshot(
            { req, url: new URL(req.url), res: { headers: new Headers() }, context: {} },
            'snapshot-secret',
        )
        const body = await response.text()
        expect(response.status).toBe(200)
        expect(body).not.toContain('private provider details')
        expect(body).not.toContain('snapshot-secret')
        expect(body).not.toContain(token)
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
