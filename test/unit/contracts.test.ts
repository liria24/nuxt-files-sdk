import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

import { contracts } from '../contracts'
import { repositoryRoot } from '../utils/fixture'

test('[META-001] every registered contract is referenced by a test and maps to an existing blocking job', async () => {
    const ci = await readFile(resolve(repositoryRoot, '.github/workflows/ci.yml'), 'utf8')
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
        expect(ci, id).toContain(`    ${job}:`)
        expect(ci.slice(ci.indexOf('    ci-ok:')), id).toContain(`            - ${job}`)
    }
})

test('[REL-002] mandatory jobs and the release artifact fail closed', async () => {
    const ci = await readFile(resolve(repositoryRoot, '.github/workflows/ci.yml'), 'utf8')
    const jobs = [
        ...ci.slice(ci.indexOf('\njobs:')).matchAll(/^    ([\w-]+):\r?\n([\s\S]*?)(?=^    [\w-]+:|$(?![\s\S]))/gmu),
    ]
    const gate = jobs.find((job) => job[1] === 'ci-ok')?.[2] ?? ''
    for (const [, name, body] of jobs) {
        if (name === 'ci-ok' || body!.includes('continue-on-error: true')) continue
        expect(gate, name).toContain(`            - ${name}`)
    }
    expect(gate).toContain('.result == "success"')
    expect(ci).not.toContain('paths-filter')
    expect(ci).not.toContain('needs: changes')
    expect(ci).toContain('windows-latest')
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
