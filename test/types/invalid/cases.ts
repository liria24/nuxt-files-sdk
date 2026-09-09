export const invalidTypeCases = [
    {
        id: 'TYPE-002',
        name: 'unknown storage name',
        source: `import { useServerFiles } from 'nuxt-files-sdk/runtime'\nuseServerFiles('unknown')\n`,
        diagnostic: /error TS2769:/u,
    },
    {
        id: 'TYPE-003',
        name: 'unknown adapter',
        diagnostic: /error TS2769:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({ storage: { adapter: 'r222', config: {} } })\n`,
    },
    {
        id: 'TYPE-004',
        name: 'devStorage plugins',
        diagnostic: /error TS2769:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\nimport { versioning } from 'nuxt-files-sdk/plugins/versioning'\n\ndefineFilesConfig({\n  storage: { adapter: 'fs', config: { root: '.data/files' }, plugins: [versioning()] },\n  devStorage: { adapter: 'fs', config: { root: '.data/dev' }, plugins: [versioning()] },\n})\n`,
    },
    {
        id: 'TYPE-005',
        name: 'devStorage hooks',
        diagnostic: /error TS2769:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({\n  storage: { adapter: 'fs', config: { root: '.data/files' }, hooks: {} },\n  devStorage: { adapter: 'fs', config: { root: '.data/dev' }, hooks: {} },\n})\n`,
    },
    {
        id: 'TYPE-007',
        name: 'removed default selector',
        diagnostic: /error TS2769:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({\n  default: 'blob',\n  storage: { blob: { adapter: 'fs', config: { root: '.data/files' } } },\n})\n`,
    },
    {
        id: 'TYPE-008',
        name: 'unknown devStorage name',
        diagnostic: /error TS2769:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({\n  storage: { blob: { adapter: 'fs', config: { root: '.data/files' } } },\n  devStorage: { unknown: { adapter: 'fs', config: { root: '.data/unknown' } } },\n})\n`,
    },
    {
        id: 'TYPE-009',
        name: 'missing provider config',
        diagnostic: /error TS2769:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({ storage: { adapter: 'fs' } })\n`,
    },
    {
        id: 'TYPE-010',
        name: 'flat provider config',
        diagnostic: /error TS2769:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({ storage: { adapter: 'fs', root: '.data/files' } })\n`,
    },
    {
        id: 'TYPE-011',
        name: 'async provider config',
        diagnostic: /error TS2769:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({ storage: { adapter: 'fs', config: async () => ({ root: '.data/files' }) } })\n`,
    },
    {
        id: 'TYPE-012',
        name: 'missing name for multiple storages',
        diagnostic: /error TS2554:/u,
        source: `import { useServerFiles } from 'nuxt-files-sdk/runtime'\nuseServerFiles()\n`,
    },
] as const
