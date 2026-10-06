import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from 'vite-plus/test'
import { parse } from 'yaml'

import { contracts } from '../contracts'
import { repositoryRoot } from '../utils/fixture'

type Workflow = {
    jobs: Record<
        string,
        {
            needs?: string[] | string
            'continue-on-error'?: boolean
            if?: string
            'runs-on'?: string
            env?: Record<string, string>
            steps?: { run?: string; uses?: string; with?: Record<string, unknown>; env?: Record<string, string> }[]
            strategy?: { 'fail-fast'?: boolean; matrix: Record<string, unknown> }
        }
    >
}
const readCI = async (): Promise<Workflow> =>
    parse(await readFile(resolve(repositoryRoot, '.github/workflows/ci.yml'), 'utf8')) as Workflow

test('[META-001] every registered contract is referenced by a test and maps to an existing blocking job', async () => {
    const ci = await readCI()
    expect(contracts.length).toBeGreaterThan(0)
    const sources: string[] = []
    for (const name of ['unit', 'nuxt', 'nitro', 'consumer', 'bundle', 'types']) {
        const directory = resolve(repositoryRoot, 'test', name)
        for (const path of await readdir(directory, { recursive: true })) {
            if (path.endsWith('.ts')) sources.push(await readFile(resolve(directory, path), 'utf8'))
        }
    }
    const referenced = new Set(sources.join('\n').match(/[A-Z]+-\d{3}/gu))
    expect(contracts.map(({ id }) => id).toSorted()).toEqual([...referenced].toSorted())
    for (const { id, source, job } of contracts) {
        expect(await readFile(resolve(repositoryRoot, source), 'utf8'), id).not.toBe('')
        expect(ci.jobs, id).toHaveProperty(job)
        expect(ci.jobs['ci-ok']?.needs, id).toContain(job)
    }
})

test('[REL-002] mandatory jobs and the release artifact fail closed', async () => {
    const ci = await readCI()
    const gate = ci.jobs['ci-ok']!
    const experimental = new Set(['test-nuxt5-nightly', 'test-vite-server-experimental'])
    expect(gate.if).toBe('always()')
    const blocking: string[] = []
    for (const [name, job] of Object.entries(ci.jobs)) {
        if (name === 'ci-ok') continue
        expect(Boolean(job['continue-on-error']), name).toBe(experimental.has(name))
        expect(Array.isArray(gate.needs) && gate.needs.includes(name), name).toBe(!experimental.has(name))
        expect(job.if, `${name} must not be conditionally skipped`).toBeUndefined()
        if (!experimental.has(name)) blocking.push(name)
    }
    expect(experimental.size).toBe(2)
    for (const name of experimental) expect(ci.jobs).toHaveProperty(name)
    expect(Array.isArray(gate.needs) && gate.needs.toSorted()).toEqual(blocking.toSorted())
    const consumer = ci.jobs['test-consumer']!
    expect(consumer.needs).toBe('build')
    expect(consumer['runs-on']).toBe('${{ matrix.os }}')
    expect(consumer.strategy?.['fail-fast']).toBe(false)
    expect(consumer.strategy?.matrix.os).toEqual(['ubuntu-latest', 'windows-latest'])
    expect(consumer.strategy?.matrix['package-manager']).toEqual(['bun', 'npm', 'pnpm'])
    expect(consumer.strategy?.matrix.compatibility).toEqual(['minimum', 'latest-supported'])
    expect(consumer.strategy?.matrix.include).toEqual([
        { compatibility: 'minimum', nuxt: '4.6.0', nitro2: '2.13.0' },
        { compatibility: 'latest-supported', nuxt: '^4.6.0', nitro2: '^2.13.0' },
    ])
    expect(consumer.env).toEqual({
        NUXT_FILES_PACKAGE_MANAGER: '${{ matrix.package-manager }}',
        NUXT_FILES_NUXT_VERSION: '${{ matrix.nuxt }}',
        NUXT_FILES_NITRO2_VERSION: '${{ matrix.nitro2 }}',
    })
    const upload = ci.jobs.build?.steps?.find(({ uses }) => uses?.startsWith('actions/upload-artifact@'))
    const download = consumer.steps?.find(({ uses }) => uses?.startsWith('actions/download-artifact@'))
    expect(upload?.uses).toBe('actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a')
    expect(download?.uses).toBe('actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c')
    expect(upload?.with?.name).toBe('files-sdk-packed')
    expect(upload?.with?.['if-no-files-found']).toBe('error')
    expect(download?.with?.name).toBe(upload?.with?.name)
    expect(download?.with?.path).toBe('${{ runner.temp }}/files-artifact')
    const buildCommands = ci.jobs.build?.steps?.map(({ run }) => run).join('\n') ?? ''
    expect(buildCommands).toContain('npm pack --ignore-scripts')
    expect(buildCommands).toContain('bun run peers:sync --check')
    expect(buildCommands).toContain('sha256sum')
    expect(buildCommands.match(/npm pack/gu)).toHaveLength(1)
    const consumerCommands = consumer.steps?.map(({ run }) => run).join('\n') ?? ''
    expect(consumerCommands).not.toMatch(/(?:npm pack|bun pm pack|bun run build)/u)
    const verification = consumer.steps?.find(({ run }) => run?.includes('verify-packed-artifact.ts'))
    expect(verification?.env?.NUXT_FILES_TARBALL).toBe('${{ runner.temp }}/files-artifact/nuxt-files-sdk.tgz')
    expect(verification?.run).toBe('bun scripts/verify-packed-artifact.ts && bun run test:consumer')
    expect(gate.steps?.map(({ run }) => run).join('\n')).toContain('all(.[]; .result == "success")')
    for (const path of [
        'actions/setup/action.yml',
        'workflows/autofix.yml',
        'workflows/preview.yml',
        'workflows/release.yml',
    ]) {
        expect(await readFile(resolve(repositoryRoot, '.github', path), 'utf8'), path).toContain(
            'version-file: package.json',
        )
    }
    const release = await readFile(resolve(repositoryRoot, '.github/workflows/release.yml'), 'utf8')
    expect(release).toContain('gh run watch "$run_id" --exit-status')
    expect(release).toContain('select(.name == "ci-ok")')
    expect(release).toContain('NUXT_FILES_TARBALL="$RUNNER_TEMP/uppt-pack/$tarball" bun run test:consumer')
    expect(release.indexOf('Verify the exact release artifact')).toBeLessThan(release.indexOf('    publish:'))
    expect(release.slice(release.indexOf('    publish:'))).toContain('needs: pack')
})

test('[REL-003] package, workspace and fixture lockfiles agree', async () => {
    const manifest = JSON.parse(
        await readFile(resolve(repositoryRoot, 'packages/nuxt-files-sdk/package.json'), 'utf8'),
    ) as { version: string; dependencies: Record<string, string>; peerDependencies: Record<string, string> }
    const lock = await readFile(resolve(repositoryRoot, 'bun.lock'), 'utf8')
    const lockedVersion = lock.match(
        /"packages\/nuxt-files-sdk": \{\s*"name": "nuxt-files-sdk",\s*"version": "([^"]+)"/u,
    )?.[1]
    expect(lockedVersion).toBe(manifest.version)
    for (const fixture of ['nuxt4', 'nuxt4-vue', 'nuxt5-nightly', 'nuxt-vite-server', 'nitro-v2', 'nitro-v3']) {
        const fixtureLock = await readFile(resolve(repositoryRoot, 'test/fixtures', fixture, 'bun.lock'), 'utf8')
        const [, dependency] = JSON.parse(fixtureLock.match(/"nuxt-files-sdk": (\[.*\]),/u)?.[1] ?? '[]')
        expect(dependency?.dependencies, fixture).toEqual(manifest.dependencies)
        expect(dependency?.peerDependencies, fixture).toEqual(manifest.peerDependencies)
    }
})
