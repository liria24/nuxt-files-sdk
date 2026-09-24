import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import { fixtureDirectory, readOutput, runCommand, runFixture, startFixtureServer } from '../utils/fixture'

const postGateway = (url: string, body: object, user?: string) =>
    fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(user && { 'x-files-user': user }) },
        body: JSON.stringify(body),
    })

const assertArchiveGateway = async (url: string): Promise<void> => {
    const response = await postGateway(url, { op: 'list' })
    expect(response.status).toBe(200)
    expect(((await response.json()) as { items: { key: string }[] }).items.map((item) => item.key)).toEqual([
        'archive.txt',
    ])
}

export const nitroSuite = (
    name: 'nitro-v2' | 'nitro-v3',
    hookModule: 'nitropack/types' | 'nitro/types',
    expected: Record<string, unknown>,
): void => {
    describe(`Nitro ${name === 'nitro-v2' ? 'v2' : 'v3'}`, () => {
        test('[NITRO-001][TYPE-006][GATEWAY-005] generates, typechecks, builds, and runs the standalone integration', async () => {
            await runFixture(name, name === 'nitro-v3' ? ['build', 'typecheck'] : undefined)
            const directory = fixtureDirectory(name)
            const generatedDirectory = resolve(
                directory,
                name === 'nitro-v3' ? 'node_modules/.nitro/nuxt-files-sdk' : '.nitro/nuxt-files-sdk',
            )
            const plugin = await readFile(resolve(generatedDirectory, 'plugin.mjs'), 'utf8')
            const types = await readFile(resolve(generatedDirectory, 'storage-registry.d.ts'), 'utf8')

            expect(plugin).toMatch(/import \{ configureFiles \} from "[^"\n]+\/runtime\/internal\.js"/u)
            expect(plugin).not.toContain("from 'nuxt-files-sdk'")
            expect(plugin).toContain('from "files-sdk/fs"')
            expect(plugin).not.toContain('files-sdk/loader')
            expect(types).toContain(`declare module "${hookModule}"`)
            expect(types).toContain("declare module 'nuxt-files-sdk/runtime'")
            expect(plugin).not.toMatch(/import config from "[A-Z]:\\\\/u)

            const gateways = (await readdir(generatedDirectory)).filter((file) => /^gateway-\d+\.mjs$/u.test(file))
            expect(gateways).toHaveLength(name === 'nitro-v2' ? 1 : 2)
            const storageRoot = resolve(directory, '.data/files')
            for (const [user, filename] of [
                ['alice', 'alice.txt'],
                ['bob', 'bob.txt'],
            ]) {
                const folder = resolve(storageRoot, 'users', user!)
                await mkdir(folder, { recursive: true })
                await writeFile(resolve(folder, filename!), user!)
            }
            if (name === 'nitro-v3') {
                const archive = resolve(directory, '.data/default')
                await mkdir(archive, { recursive: true })
                await writeFile(resolve(archive, 'archive.txt'), 'archive')
            }

            const server = await startFixtureServer(name)
            try {
                await expect(fetch(`${server.url}/files`).then((response) => response.json())).resolves.toEqual(
                    expected,
                )
                const endpoint = `${server.url}${name === 'nitro-v2' ? '/gateway' : '/gateway/blob'}`
                const denied = await postGateway(endpoint, { op: 'list' })
                expect(denied.ok).toBe(false)
                const [alice, bob] = (await Promise.all([
                    postGateway(endpoint, { op: 'list' }, 'alice').then((response) => response.json()),
                    postGateway(endpoint, { op: 'list' }, 'bob').then((response) => response.json()),
                ])) as [{ items: { key: string }[] }, { items: { key: string }[] }]
                expect(alice.items.map((item) => item.key)).toEqual(['alice.txt'])
                expect(bob.items.map((item) => item.key)).toEqual(['bob.txt'])
                expect((await postGateway(endpoint, { op: 'delete', key: 'alice.txt' }, 'alice')).status).toBe(403)

                const presigned = (await postGateway(
                    endpoint,
                    {
                        op: 'presign',
                        files: [{ name: 'new.txt', size: 3, type: 'text/plain' }],
                    },
                    'alice',
                ).then((response) => response.json())) as {
                    uploads: {
                        id: string
                        key: string
                        target: { url: string; method: string; headers: Record<string, string> }
                    }[]
                }
                expect(presigned.uploads).toHaveLength(1)
                const upload = presigned.uploads[0]!
                if (name === 'nitro-v2') {
                    await writeFile(resolve(storageRoot, 'users/alice', upload.key), '')
                }
                const proxied = await fetch(upload.target.url, {
                    method: upload.target.method,
                    headers: upload.target.headers,
                    body: 'new',
                })
                expect(proxied.status, await proxied.text()).toBe(200)
                const completed = (await postGateway(
                    endpoint,
                    {
                        op: 'complete',
                        completions: [{ id: upload.id, key: upload.key }],
                    },
                    'alice',
                ).then((response) => response.json())) as { files: { key: string }[] }
                expect(completed.files.map((file) => file.key)).toEqual([upload.key])
                if (name === 'nitro-v3') {
                    await assertArchiveGateway(`${server.url}/gateway/archive`)
                }
            } finally {
                await server.close()
            }
        })

        test('[BUNDLE-008] builds R2, MinIO, and RustFS for workerd without bundling AWS SDK engines', async () => {
            const cloudflare = resolve(fixtureDirectory(name), 'cloudflare')
            await Promise.all(
                ['.nitro', 'node_modules/.nitro', '.output', '.wrangler'].map((entry) =>
                    rm(resolve(cloudflare, entry), { recursive: true, force: true }),
                ),
            )
            await runCommand('bunx', [name === 'nitro-v2' ? 'nitropack' : 'nitro', 'build'], { cwd: cloudflare })

            const generatedDirectory = resolve(
                cloudflare,
                name === 'nitro-v3' ? 'node_modules/.nitro/nuxt-files-sdk' : '.nitro/nuxt-files-sdk',
            )
            const generated = await readOutput(generatedDirectory)
            for (const adapter of ['minio', 'r2', 'rustfs']) {
                expect(generated).toContain(`from "files-sdk/${adapter}"`)
            }
            const generatedFiles = await readdir(generatedDirectory)
            expect(generatedFiles.some((file) => file.includes('aws-sdk-client-s3'))).toBe(name === 'nitro-v2')

            const output = await readOutput(resolve(cloudflare, '.output'))
            expect(output).not.toMatch(/node_modules\/@aws-sdk\//u)

            if (name === 'nitro-v2') {
                const wranglerOutput = resolve(cloudflare, '.wrangler-dry-run')
                await rm(wranglerOutput, { recursive: true, force: true })
                try {
                    await runCommand(
                        'bunx',
                        [
                            'wrangler',
                            'deploy',
                            '.output/server/index.mjs',
                            '--name',
                            'nuxt-files-sdk-nitro-v2-fixture',
                            '--dry-run',
                            '--outdir',
                            wranglerOutput,
                            '--compatibility-date',
                            '2026-09-04',
                        ],
                        { cwd: cloudflare },
                    )
                } finally {
                    await rm(wranglerOutput, { recursive: true, force: true })
                }
            }
        })
    })
}
