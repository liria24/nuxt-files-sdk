import { defineConfig } from 'tsdown'

export default defineConfig({
    attw: { level: 'error', profile: 'esm-only' },
    clean: true,
    copy: [{ from: 'src/types.d.ts', to: 'dist' }],
    deps: {
        dts: { neverBundle: true },
        neverBundle: true,
        onlyImport: ['@nuxt/kit', 'files-sdk', 'node:fs', 'node:fs/promises', 'node:path'],
    },
    dts: true,
    entry: {
        config: 'src/config.ts',
        module: 'src/module.ts',
        nitro: 'src/nitro.ts',
        plugins: 'src/plugins.ts',
    },
    exports: false,
    format: ['esm'],
    platform: 'neutral',
    publint: true,
    sourcemap: true,
    unbundle: true,
})
