export const invalidTypeCases = [
    ...[
        [
            'TYPE-029',
            'custom factory switch cannot inherit config by structural identity',
            "storage: { adapter: (options: { root: string }) => { throw new Error(options.root) }, config: { root: '.' } }, $development: { storage: { adapter: (options: { root: string }) => { throw new Error(options.root) } } }",
        ],
        [
            'TYPE-020',
            'adapter switch still needs config',
            "storage: { adapter: 'memory' }, $development: { storage: { adapter: 'fs' } }",
        ],
        [
            'TYPE-021',
            'adapter switch cannot inherit config',
            "storage: { adapter: 'r2', config: { bucket: 'base' } }, $development: { storage: { adapter: 's3' } }",
        ],
        [
            'TYPE-022',
            'new storage still needs config',
            "storage: { archive: { adapter: 'fs', config: { root: '.' } } }, $development: { storage: { debug: { adapter: 'fs' } } }",
        ],
        [
            'TYPE-023',
            'new storage cannot inherit adapter',
            "storage: { archive: { adapter: 'memory' } }, $development: { storage: { debug: { prefix: 'dev' } } }",
        ],
        ['TYPE-024', 'environment-only storage still needs adapter', "$development: { storage: { prefix: 'dev' } }"],
        [
            'TYPE-025',
            'resolver replacement still needs complete config',
            "storage: { adapter: 'fs', config: { root: '.' } }, $development: { storage: { config: () => ({ urlBaseUrl: '/' }) } }",
        ],
        [
            'TYPE-026',
            'object cannot inherit config from resolver',
            "storage: { adapter: 'fs', config: () => ({ root: '.' }) }, $development: { storage: { config: { urlBaseUrl: '/' } } }",
        ],
        [
            'TYPE-027',
            'partial override rejects unknown options',
            "storage: { adapter: 'fs', config: { root: '.' } }, $development: { storage: { prefx: 'dev' } }",
        ],
        [
            'TYPE-028',
            'partial override checks option values',
            "storage: { adapter: 'fs', config: { root: '.' } }, $env: { staging: { storage: { prefix: 123 } } }",
        ],
    ].map(([id, name, config]) => ({
        id: id!,
        name: name!,
        diagnostic: /error TS\d+:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\ndefineFilesConfig({ ${config} })\n`,
    })),
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
