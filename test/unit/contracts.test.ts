import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'
import { parse } from 'yaml'

import { contracts } from '../contracts'
import { repositoryRoot } from '../utils/fixture'

type Workflow = {
    jobs: Record<
        string,
        {
            needs?: string[] | string
            'continue-on-error'?: boolean
            steps?: { run?: string }[]
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
    for (const [name, job] of Object.entries(ci.jobs)) {
        if (name === 'ci-ok' || job['continue-on-error']) continue
        expect(gate.needs, name).toContain(name)
    }
    expect(gate.steps?.map(({ run }) => run).join('\n')).toContain('.result == "success"')
    for (const path of [
        'actions/setup/action.yml',
        'workflows/autofix.yml',
        'workflows/preview.yml',
        'workflows/release.yml',
    ]) {
        expect(await readFile(resolve(repositoryRoot, '.github', path), 'utf8'), path).toContain(
            'bun-version-file: package.json',
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
    for (const fixture of ['nuxt4', 'nuxt4-vue', 'nuxt5-nightly', 'nitro-v2', 'nitro-v3']) {
        const fixtureLock = await readFile(resolve(repositoryRoot, 'test/fixtures', fixture, 'bun.lock'), 'utf8')
        const [, dependency] = JSON.parse(fixtureLock.match(/"nuxt-files-sdk": (\[.*\]),/u)?.[1] ?? '[]')
        expect(dependency?.dependencies, fixture).toEqual(manifest.dependencies)
        expect(dependency?.peerDependencies, fixture).toEqual(manifest.peerDependencies)
    }
})
