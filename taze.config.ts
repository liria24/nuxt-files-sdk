import { defineConfig } from 'taze'

export default defineConfig({
    force: true,
    includeLocked: true,
    install: false,
    interactive: true,
    recursive: true,
    write: true,
    ignorePaths: ['**/node_modules/**'],
    ignoreOtherWorkspaces: true,
    depFields: { overrides: false },
    exclude: ['typescript@7', 'h3@2', 'c12@4'],
})
