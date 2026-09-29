import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { expect, test, vi } from 'vitest'

import type { DependencyRequirement } from '../../packages/nuxt-files-sdk/src/integration/dependencies'
import { diagnoseDependencies, reportDependencyIssues } from '../../packages/nuxt-files-sdk/src/integration/diagnostics'
import type { PackageInfo } from '../../packages/nuxt-files-sdk/src/integration/resolve'

test('[DEP-003] diagnoses from the SDK importer silently and only reports changed, confirmed failures', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'files-diagnostics-'))
    const manifestPath = resolve(root, 'package.json')
    const sdk: PackageInfo = {
        root,
        manifestPath,
        manifest: {
            name: 'files-sdk',
            version: '2.6.2',
            exports: { './adapter': './adapter.js' },
            peerDependencies: { 'test-peer': '^2.0.0' },
        },
    }
    const required: DependencyRequirement = {
        subpath: 'files-sdk/adapter',
        dependency: 'test-peer/client',
        necessity: 'required',
        stage: 'import',
        reason: 'Static import',
    }
    const peer = resolve(root, 'node_modules/test-peer')
    const install = async (version: string, exports: Record<string, string>) => {
        await mkdir(peer, { recursive: true })
        await writeFile(resolve(peer, 'package.json'), JSON.stringify({ name: 'test-peer', version, exports }))
        await writeFile(resolve(peer, 'client.js'), '')
    }
    try {
        await writeFile(manifestPath, JSON.stringify(sdk.manifest))
        await writeFile(resolve(root, 'adapter.js'), '')
        const stdout = vi.spyOn(process.stdout, 'write')
        const stderr = vi.spyOn(process.stderr, 'write')
        let missing
        try {
            missing = diagnoseDependencies(sdk, [required])
            expect(missing[0]?.status).toBe('missing')
            expect(diagnoseDependencies(sdk, [{ ...required, necessity: 'unknown' }])[0]?.status).toBe('unknown')
            expect(diagnoseDependencies(sdk, [{ ...required, necessity: 'conditional' }])[0]?.status).toBe('unknown')
            expect(diagnoseDependencies(sdk, [required], { 'test-peer': '/user-alias.js' })[0]?.status).toBe('unknown')
            expect(diagnoseDependencies(sdk, [required], { 'test-peer': '/shim.js' }, ['test-peer'])[0]?.status).toBe(
                'missing',
            )
            expect(stdout).not.toHaveBeenCalled()
            expect(stderr).not.toHaveBeenCalled()
        } finally {
            stdout.mockRestore()
            stderr.mockRestore()
        }
        const warn = vi.fn()
        const state = new Set<string>()
        reportDependencyIssues(missing, state, warn)
        reportDependencyIssues(missing, state, warn)
        expect(warn).toHaveBeenCalledOnce()
        await install('2.0.0', { './other': './client.js' })
        expect(diagnoseDependencies(sdk, [required])[0]?.status).toBe('unresolved')
        await install('1.0.0', { './client': './client.js' })
        const incompatible = diagnoseDependencies(sdk, [required])
        expect(incompatible[0]?.status).toBe('incompatible')
        reportDependencyIssues(incompatible, state, warn)
        expect(warn).toHaveBeenCalledTimes(2)
        await install('2.1.0', { './client': './client.js' })
        const satisfied = diagnoseDependencies(sdk, [required])
        expect(satisfied[0]?.status).toBe('satisfied')
        reportDependencyIssues(satisfied, state, warn)
        expect(state.size).toBe(0)
        expect(warn).toHaveBeenCalledTimes(2)
        reportDependencyIssues(missing, state, warn)
        expect(warn).toHaveBeenCalledTimes(3)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})
