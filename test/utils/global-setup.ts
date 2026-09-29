import type { TestProject } from 'vitest/node'

import { runCommand } from './fixture'

let build: Promise<string> | undefined

export default async (project: TestProject): Promise<void> => {
    await (build ??= runCommand('bun', ['run', 'build']))
    project.provide('filesPackageBuilt', true)
}

declare module 'vitest' {
    export interface ProvidedContext {
        filesPackageBuilt: boolean
    }
}
