export const invalidTypeCases = [
    {
        id: 'TYPE-002',
        name: 'unknown storage name',
        source: `import { useServerFiles } from 'nuxt-files-sdk/runtime'\nuseServerFiles('unknown')\n`,
        diagnostic: /error TS\d+:/u,
    },
    {
        id: 'TYPE-003',
        name: 'unknown adapter',
        diagnostic: /error TS2322:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({ storage: { adapter: 'r222', config: {} } })\n`,
    },
    {
        id: 'TYPE-004',
        name: 'removed devStorage key',
        diagnostic: /error TS\d+:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({\n  storage: { adapter: 'memory' },\n  devStorage: { adapter: 'fs', config: { root: '.data/dev' } },\n})\n`,
    },
    {
        id: 'TYPE-005',
        name: 'mistyped environment key',
        diagnostic: /error TS\d+:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({ storage: { adapter: 'memory' }, $develpoment: { storage: { adapter: 'memory' } } })\n`,
    },
    {
        id: 'TYPE-007',
        name: 'removed default selector',
        diagnostic: /error TS\d+:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({\n  default: 'blob',\n  storage: { blob: { adapter: 'fs', config: { root: '.data/files' } } },\n})\n`,
    },
    {
        id: 'TYPE-008',
        name: 'invalid environment storage shape',
        diagnostic: /error TS\d+:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({ storage: { adapter: 'memory' }, $test: { storage: { debug: { config: {} } } } })\n`,
    },
    {
        id: 'TYPE-009',
        name: 'missing provider config',
        diagnostic: /error TS\d+:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({ storage: { adapter: 'fs' } })\n`,
    },
    {
        id: 'TYPE-010',
        name: 'flat provider config',
        diagnostic: /error TS\d+:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({ storage: { adapter: 'fs', root: '.data/files' } })\n`,
    },
    {
        id: 'TYPE-011',
        name: 'async provider config',
        diagnostic: /error TS\d+:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({ storage: { adapter: 'fs', config: async () => ({ root: '.data/files' }) } })\n`,
    },
    {
        id: 'TYPE-012',
        name: 'missing name for multiple storages',
        diagnostic: /error TS2554:/u,
        source: `import { useServerFiles } from 'nuxt-files-sdk/runtime'\nuseServerFiles()\n`,
    },
    {
        id: 'TYPE-015',
        name: 'gateway route without named storage',
        diagnostic: /error TS\d+:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({ storage: { blob: { adapter: 'memory' } }, routes: [{ path: '/api/files' }] })\n`,
    },
    {
        id: 'TYPE-016',
        name: 'gateway route with unknown storage',
        diagnostic: /error TS\d+:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({ storage: { blob: { adapter: 'memory' } }, routes: [{ path: '/api/files', storage: 'missing' }] })\n`,
    },
] as const
