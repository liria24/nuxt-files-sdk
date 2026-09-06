import { defineConfig } from 'oxfmt'

export default defineConfig({
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
    tabWidth: 4,
    trailingComma: 'all',
})
