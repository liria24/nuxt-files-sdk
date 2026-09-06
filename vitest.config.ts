import { defineConfig } from 'vitest/config'

const project = (name: string, include: string[]) => ({
    test: {
        name,
        include,
        environment: 'node' as const,
        fileParallelism: false,
        hookTimeout: 300_000,
        testTimeout: 300_000,
    },
})

export default defineConfig({
    test: {
        fileParallelism: false,
        maxWorkers: 1,
        projects: [
            project('unit', ['test/unit/**/*.test.ts']),
            project('nuxt4', ['test/nuxt/nuxt4*.test.ts', 'test/nuxt/vue.test.ts', 'test/nuxt/devtools.test.ts']),
            project('nuxt5', ['test/nuxt/nuxt5*.test.ts']),
            project('nitro-v2', ['test/nitro/v2.test.ts']),
            project('nitro-v3', ['test/nitro/v3.test.ts']),
            project('consumer', ['test/consumer/packed.test.ts']),
            project('bundle', ['test/bundle/bundle.test.ts']),
        ],
    },
})
