import { defineConfig } from 'oxlint'

export default defineConfig({
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
    options: { typeAware: true },
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
})
