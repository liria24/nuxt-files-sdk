import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const fileHash = (path: string): string => {
    try {
        return createHash('sha256').update(readFileSync(path)).digest('hex')
    } catch {
        return 'unavailable'
    }
}

/** Development only: a failed rebuild must never leave old authorization accepting requests. */
export const developmentConfigCurrent = (files: Record<string, string>): boolean =>
    // ponytail: hash the small config graph per dev request; use worker invalidation if this becomes costly.
    Object.entries(files).every(([path, hash]) => hash !== 'unavailable' && fileHash(path) === hash)
