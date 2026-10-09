import { memory } from 'files-sdk/memory'
import { r2, type R2Bucket } from 'files-sdk/r2'
import { expect, test, vi } from 'vite-plus/test'

import { defineFilesConfig } from '../../packages/nuxt-files-sdk/src/config'
import { FilesRegistry } from '../../packages/nuxt-files-sdk/src/runtime/registry'

test('[DEV-009][SEC-002] capabilities reflect initialized native clients without constructing other storages', async () => {
    const binding = vi.fn<() => { binding: R2Bucket; publicBaseUrl: string }>(() => ({
        binding: {} as R2Bucket,
        publicBaseUrl: 'https://files.example',
    }))
    const registry = new FilesRegistry(
        defineFilesConfig({
            storage: {
                binding: { adapter: 'r2', config: binding },
                fetch: {
                    adapter: 'r2',
                    config: {
                        bucket: 'test',
                        accountId: 'test',
                        accessKeyId: 'test',
                        secretAccessKey: 'snapshot-secret',
                        client: 'fetch',
                    },
                },
                custom: {
                    adapter: 'memory',
                    plugins: [
                        {
                            name: 'capability-filter',
                            capabilities: (caps) => ({
                                ...caps,
                                signedUpload: { ...caps.signedUpload, supported: false, secret: 'plugin-secret' },
                                events: { format: 'memory', secret: 'event-secret' },
                                secret: 'plugin-secret',
                            }),
                        },
                    ],
                },
            },
        }),
        { factories: { r2, memory } },
    )
    expect(registry.inspect().storages.every((storage) => !('capabilities' in storage))).toBe(true)
    expect(binding).not.toHaveBeenCalled()
    const fetchFiles = registry.get('fetch')
    const fetchCaps = registry.inspect().storages.find(({ name }) => name === 'fetch')!.capabilities
    expect(fetchCaps).toEqual(fetchFiles.capabilities)
    expect(fetchCaps).toMatchObject({
        resumable: false,
        events: { format: 'r2' },
        signedUpload: { supported: true, maxSize: false },
        signedUrl: { supported: true, expiry: 'exact', maxExpiresIn: 604800 },
    })
    expect(binding).not.toHaveBeenCalled()
    const bindingFiles = registry.get('binding')
    expect(registry.inspect().storages[0]!.capabilities).toEqual(bindingFiles.capabilities)
    expect(bindingFiles.capabilities).toMatchObject({
        publicUrl: true,
        signedUrl: { supported: false, expiry: 'none' },
    })
    await expect(bindingFiles.url('local.txt', { expiresIn: 300 })).rejects.toMatchObject({ code: 'Unsupported' })
    registry.get('custom')
    expect(registry.inspect().storages[2]!.capabilities).toMatchObject({
        signedUpload: { supported: false },
        events: { format: 'memory' },
    })
    expect(JSON.stringify(registry.inspect())).not.toMatch(/snapshot-secret|plugin-secret|event-secret|files\.example/)
})
