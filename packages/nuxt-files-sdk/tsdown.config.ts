import { defineConfig } from 'tsdown'

export default defineConfig({
    attw: { level: 'error', profile: 'esm-only' },
    clean: true,
    deps: {
        dts: { neverBundle: true },
        neverBundle: true,
        onlyImport: ['@nuxt/kit', 'c12', 'files-sdk', 'node:path'],
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
