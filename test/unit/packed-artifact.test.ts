import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

import { verifyPackedArtifact } from '../../scripts/verify-packed-artifact'

test('[ARCHIVE-001] downloaded archive integrity rejects mutation and malformed expected digests', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'files-archive-digest-'))
    const path = resolve(directory, 'archive.tgz')
    try {
        const bytes = 'immutable fixture archive'
        const digest = createHash('sha256').update(bytes).digest('hex')
        await writeFile(path, bytes)
        expect(await verifyPackedArtifact(path, digest)).toBe(digest)
        await writeFile(path, `${bytes} changed`)
        await expect(verifyPackedArtifact(path, digest)).rejects.toThrow(/SHA.256 mismatch/u)
        await expect(verifyPackedArtifact(path, 'missing')).rejects.toThrow('Invalid packed-artifact')
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})
