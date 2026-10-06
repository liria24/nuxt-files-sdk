import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { expect, test } from 'vite-plus/test'

import { readOutput } from '../utils/fixture'

test('deployment scans follow directory junctions without losing linked runtime files or looping', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'files-output-'))
    try {
        const output = resolve(directory, 'output')
        const dependency = resolve(directory, 'dependency')
        await mkdir(output)
        await mkdir(dependency)
        await writeFile(resolve(output, 'entry.mjs'), 'entry-marker')
        await writeFile(resolve(dependency, 'runtime.mjs'), 'linked-runtime-marker')
        await writeFile(resolve(dependency, 'types.d.ts'), 'types-marker')
        await symlink(dependency, resolve(output, 'dependency'), 'junction')
        await symlink(output, resolve(dependency, 'cycle'), 'junction')
        expect(await readOutput(output)).toContain('linked-runtime-marker')
        const runtime = await readOutput(output, true)
        expect(runtime).toContain('entry-marker')
        expect(runtime).toContain('linked-runtime-marker')
        expect(runtime).not.toContain('types-marker')
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})
