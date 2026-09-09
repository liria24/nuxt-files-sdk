import { defineConfig } from 'tsdown'

export default defineConfig({
    attw: { level: 'error', profile: 'esm-only' },
    clean: true,
    copy: [
        { from: 'src/devtools/client/index.html', to: 'dist/devtools/client' },
        { from: '../../README.md', to: '.' },
    ],
    deps: {
        dts: { neverBundle: true },
        neverBundle: true,
        onlyImport: [
            '@nuxt/kit',
            'devframe',
            'files-sdk',
            'jiti',
            'node:fs',
            'node:fs/promises',
            'node:path',
            'node:url',
        ],
    },
    dts: true,
    entry: {
        config: 'src/config.ts',
        module: 'src/module.ts',
        nitro: 'src/nitro.ts',
        plugins: 'src/plugins.ts',
        'plugins/versioning': 'src/plugin-versioning.ts',
        runtime: 'src/runtime.ts',
        'devtools/nuxt-v3-handler': 'src/devtools/nuxt-v3-handler.ts',
        'devtools/snapshot': 'src/devtools/snapshot.ts',
    },
    exports: false,
    format: ['esm'],
    platform: 'neutral',
    publint: true,
    sourcemap: true,
    unbundle: true,
})
