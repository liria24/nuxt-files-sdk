import { defineConfig } from 'vitest/config'

const project = (name: string, include: string[]) => ({
    test: {
        name,
        include,
        environment: 'node' as const,
        env: {
            NUXT_APP_SECRET: 'fixture-only-root-secret-for-files-gateway-2026',
            FILES_API_SECRET: 'fixture-only-explicit-nitro-gateway-secret',
        },
        ...(name === 'unit' || name === 'consumer' ? {} : { globalSetup: ['./test/utils/global-setup.ts'] }),
        fileParallelism: false,
        hookTimeout: 300_000,
        testTimeout: 300_000,
    },
})

export default defineConfig({
    tsconfig: 'test/tsconfig.json',
    test: {
        fileParallelism: false,
        maxWorkers: 1,
        projects: [
            project('unit', ['test/unit/**/*.test.ts']),
            project('nuxt4', ['test/nuxt/nuxt4*.test.ts', 'test/nuxt/vue.test.ts', 'test/nuxt/devtools.test.ts']),
            project('vite-server', ['test/nuxt/vite-server.test.ts']),
            project('nuxt5', ['test/nuxt/nuxt5*.test.ts']),
            project('nitro-v2', ['test/nitro/v2.test.ts']),
            project('nitro-v3', ['test/nitro/v3.test.ts']),
            project('consumer', ['test/consumer/packed.test.ts']),
            project('bundle', ['test/bundle/bundle.test.ts']),
        ],
    },
})
