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
})
