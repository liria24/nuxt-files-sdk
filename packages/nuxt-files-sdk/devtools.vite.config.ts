import { resolve } from 'node:path'

import { NuxtIconBundle } from '@nuxt/icon/vite'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

import { defaultFilesIcons } from './src/ui/icons.ts'

export default defineConfig({
    root: resolve(import.meta.dirname, 'src/devtools/client'),
    base: './',
    plugins: [
        vue(),
        tailwindcss(),
        NuxtIconBundle({
            icons: Object.values(defaultFilesIcons).map((name) => name.replace(/^i-([^-]+)-/u, '$1:')),
            scan: false,
        }),
    ],
    build: {
        outDir: resolve(import.meta.dirname, 'dist/devtools/client'),
        emptyOutDir: false,
        cssCodeSplit: false,
        sourcemap: false,
        rollupOptions: {
            output: {
                entryFileNames: 'app.js',
                codeSplitting: false,
                assetFileNames: (asset) => (asset.names.includes('style.css') ? 'style.css' : '[name][extname]'),
            },
        },
    },
})
