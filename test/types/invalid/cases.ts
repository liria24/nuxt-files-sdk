export const invalidTypeCases = [
    {
        id: 'TYPE-002',
        name: 'unknown storage name',
        source: `import { useServerFiles } from 'nuxt-files-sdk/runtime'\nawait useServerFiles('unknown')\n`,
        diagnostic: /error TS2345:/u,
    },
    {
        id: 'TYPE-003',
        name: 'unknown adapter',
        diagnostic: /error TS2322:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({ storage: { blob: { adapter: 'r222' } } })\n`,
    },
    {
        id: 'TYPE-004',
        name: 'devStorage plugins',
        diagnostic: /error TS2322:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\nimport { versioning } from 'nuxt-files-sdk/plugins'\n\ndefineFilesConfig({\n  storage: { blob: { adapter: 'fs' } },\n  devStorage: { blob: { adapter: 'fs', plugins: [versioning()] } },\n})\n`,
    },
    {
        id: 'TYPE-005',
        name: 'devStorage hooks',
        diagnostic: /error TS2322:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({\n  storage: { blob: { adapter: 'fs' } },\n  devStorage: { blob: { adapter: 'fs', hooks: {} } },\n})\n`,
    },
    {
        id: 'TYPE-007',
        name: 'unknown default storage',
        diagnostic: /error TS2322:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({\n  default: 'unknown',\n  storage: { blob: { adapter: 'fs' } },\n})\n`,
    },
    {
        id: 'TYPE-008',
        name: 'unknown devStorage name',
        diagnostic: /error TS2353:/u,
        source: `import { defineFilesConfig } from 'nuxt-files-sdk/config'\n\ndefineFilesConfig({\n  storage: { blob: { adapter: 'fs' } },\n  devStorage: { unknown: { adapter: 'fs' } },\n})\n`,
    },
] as const
