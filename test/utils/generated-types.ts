import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect } from 'vitest'

import { invalidTypeCases } from '../types/invalid/cases'
import { runCommand } from './fixture'

export const cleanTypeContracts = async (directory: string): Promise<void> => {
    for (const name of ['.contract-invalid', '.contract-examples']) {
        await rm(resolve(directory, name), { recursive: true, force: true })
    }
}

export const checkGeneratedTypes = async (directory: string): Promise<void> => {
    const generated = await readFile(resolve(directory, '.nuxt/nuxt-files-sdk/storage-registry.d.ts'), 'utf8')
    expect(generated).toContain("declare module 'nuxt-files-sdk/runtime'")
    expect(generated).toContain('DefaultStorage<typeof config>')
}

export const checkInvalidType = async (
    directory: string,
    { source, diagnostic }: (typeof invalidTypeCases)[number],
): Promise<void> => {
    const invalidDirectory = resolve(directory, '.contract-invalid')
    await rm(invalidDirectory, { recursive: true, force: true })
    await mkdir(invalidDirectory, { recursive: true })
    await Promise.all([
        writeFile(resolve(invalidDirectory, 'invalid.ts'), source),
        writeFile(
            resolve(invalidDirectory, 'tsconfig.json'),
            JSON.stringify({
                extends: '../.nuxt/tsconfig.json',
                include: ['../.nuxt/nuxt.d.ts', './invalid.ts'],
            }),
        ),
    ])
    const error = await runCommand('bun', ['x', 'vue-tsc', '--noEmit', '-p', '.contract-invalid/tsconfig.json'], {
        cwd: directory,
    }).then(
        () => '',
        (failure: unknown) => String(failure),
    )
    expect(error).toMatch(/invalid\.ts\(\d+,\d+\): error TS/)
    expect(error).toMatch(diagnostic)
}

export const checkPublicExamples = async (directory: string): Promise<void> => {
    const examplesDirectory = resolve(directory, '.contract-examples')
    await mkdir(examplesDirectory, { recursive: true })
    await writeFile(
        resolve(examplesDirectory, 'tsconfig.json'),
        JSON.stringify({
            extends: '../.nuxt/tsconfig.server.json',
            include: [
                '../.nuxt/types/nitro.d.ts',
                '../.nuxt/nuxt-files-sdk/storage-registry.d.ts',
                '../files.config.ts',
                '../types.contract.ts',
            ],
        }),
    )
    await runCommand('bun', ['x', 'vue-tsc', '--noEmit', '-p', '.contract-examples/tsconfig.json'], { cwd: directory })
}
