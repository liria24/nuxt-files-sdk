export const storage = {
    archive: { adapter: 'fs', config: { root: '.data/default' } },
    blob: { adapter: 'fs', config: { root: '.data/files' } },
} as const
