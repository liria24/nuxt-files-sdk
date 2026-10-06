import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export const verifyPackedArtifact = async (tarball: string, expected: string): Promise<string> => {
    if (!/^[a-f0-9]{64}$/u.test(expected)) throw new Error('Invalid packed-artifact SHA-256')
    const actual = createHash('sha256')
        .update(await readFile(tarball))
        .digest('hex')
    if (actual !== expected) throw new Error('Packed-artifact SHA-256 mismatch')
    return actual
}

if (import.meta.main) {
    const tarball = process.env.NUXT_FILES_TARBALL
    if (!tarball) throw new Error('NUXT_FILES_TARBALL must identify the downloaded archive')
    const expected = (await readFile(resolve(dirname(tarball), 'sha256.txt'), 'utf8')).trim()
    await verifyPackedArtifact(tarball, expected)
}
