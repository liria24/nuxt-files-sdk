import { defineConfig } from 'vite-plus'

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
    fmt: {
        ignorePatterns: [
            '**/.nuxt/**',
            '**/.nitro/**',
            '**/.output/**',
            '**/.contract-*/**',
            '**/coverage/**',
            '**/dist/**',
            '**/node_modules/**',
        ],
        printWidth: 120,
        semi: false,
        singleQuote: true,
        sortImports: true,
        sortPackageJson: true,
        sortTailwindcss: {},
        tabWidth: 4,
        trailingComma: 'all',
    },
    lint: {
        categories: {
            correctness: 'error',
            perf: 'warn',
            suspicious: 'error',
        },
        env: { browser: true, node: true },
        ignorePatterns: [
            '**/.nuxt/**',
            '**/.nitro/**',
            '**/.output/**',
            '**/coverage/**',
            '**/dist/**',
            'test/fixtures/**',
        ],
        options: { typeAware: true, typeCheck: true },
        plugins: ['import', 'typescript', 'unicorn', 'vitest'],
        rules: {
            'import/no-cycle': 'error',
            'no-console': 'warn',
            'typescript/no-floating-promises': 'error',
        },
        overrides: [
            {
                files: ['test/**/*.ts'],
                rules: {
                    'typescript/no-explicit-any': 'off',
                    // Negative inputs and minimal framework doubles deliberately narrow types.
                    'typescript/no-unsafe-type-assertion': 'off',
                    'vitest/valid-expect': ['error', { maxArgs: 2 }],
                    // Fixture prepare/typecheck/build and dependent lifecycle operations are ordered.
                    'no-await-in-loop': 'off',
                },
            },
        ],
    },
    tsconfig: 'test/tsconfig.json',
    test: {
        fileParallelism: false,
        maxWorkers: 1,
        projects: [
            project('unit', ['test/unit/**/*.test.ts']),
            project('nuxt4', ['test/nuxt/nuxt4*.test.ts', 'test/nuxt/vue.test.ts', 'test/nuxt/devtools.test.ts']),
            project('vite-server', ['test/nuxt/vite-server.test.ts']),
            project('nuxt5', ['test/nuxt/nuxt5*.test.ts']),
            project('nitro-v2', ['test/nitro/v2.test.ts', 'test/nitro/dev-close.test.ts']),
            project('nitro-v3', ['test/nitro/v3.test.ts']),
            project('consumer', ['test/consumer/packed.test.ts']),
            project('bundle', ['test/bundle/bundle.test.ts']),
        ],
    },
})
