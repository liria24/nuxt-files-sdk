import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { expect } from 'vitest'
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node'

import { invalidTypeCases } from '../types/invalid/cases'
import { repositoryRoot, runCommand } from './fixture'

export const cleanTypeContracts = async (directory: string): Promise<void> => {
    invalidTypeRuns.delete(directory)
    for (const name of ['.contract-docs', '.contract-invalid', '.contract-examples']) {
        await rm(resolve(directory, name), { recursive: true, force: true })
    }
}

export const checkGeneratedTypes = async (directory: string): Promise<void> => {
    const imports = await readFile(resolve(directory, '.nuxt/types/nitro-imports.d.ts'), 'utf8')
    const registry = await readFile(resolve(directory, '.nuxt/nuxt-files-sdk/registry.mjs'), 'utf8').catch(() =>
        readFile(resolve(directory, 'node_modules/.cache/nuxt/.nuxt/nuxt-files-sdk/registry.mjs'), 'utf8'),
    )
    expect(imports).not.toMatch(/node_modules\/nuxt-files-sdk\/runtime/u)
    expect(registry).not.toContain('files-sdk/loader')
}

const invalidTypeRuns = new Map<string, Promise<string>>()
const compileInvalidTypes = async (directory: string): Promise<string> => {
    const invalidDirectory = resolve(directory, '.contract-invalid')
    await rm(invalidDirectory, { recursive: true, force: true })
    await mkdir(invalidDirectory, { recursive: true })
    await Promise.all([
        ...invalidTypeCases.map(({ id, source }) =>
            writeFile(resolve(invalidDirectory, id + '.ts'), source + '\nexport {}\n'),
        ),
        writeFile(
            resolve(invalidDirectory, 'tsconfig.json'),
            JSON.stringify({
                extends: '../.nuxt/tsconfig.json',
                include: ['../.nuxt/nuxt.d.ts', './*.ts'],
            }),
        ),
    ])
    return runCommand(
        'bun',
        ['x', 'vue-tsc', '--noEmit', '--pretty', 'false', '-p', '.contract-invalid/tsconfig.json'],
        { cwd: directory },
    ).then(
        () => '',
        (failure: unknown) => String(failure),
    )
}

export const checkInvalidType = async (
    directory: string,
    { id, diagnostic }: (typeof invalidTypeCases)[number],
): Promise<void> => {
    if (!invalidTypeRuns.has(directory)) invalidTypeRuns.set(directory, compileInvalidTypes(directory))
    const output = await invalidTypeRuns.get(directory)!
    const errors = output
        .split('\n')
        .filter((line) => line.includes(id + '.ts('))
        .join('\n')
    expect(errors, output).toMatch(diagnostic)
}

export const checkPublicExamples = async (directory: string): Promise<void> => {
    const examplesDirectory = resolve(directory, '.contract-examples')
    await mkdir(examplesDirectory, { recursive: true })
    await writeFile(
        resolve(examplesDirectory, 'tsconfig.json'),
        JSON.stringify({
            extends: '../.nuxt/tsconfig.server.json',
            include: [
                '../.nuxt/types/imports.d.ts',
                '../.nuxt/types/nitro.d.ts',
                '../.nuxt/nuxt.server.d.ts',
                '../.nuxt/nuxt-files-sdk/storage-registry.d.ts',
                '../node_modules/.cache/nuxt/.nuxt/nuxt-files-sdk/storage-registry.d.ts',
                '../files.config.ts',
                '../types.contract.ts',
            ],
        }),
    )
    await runCommand('bun', ['x', 'vue-tsc', '--noEmit', '-p', '.contract-examples/tsconfig.json'], { cwd: directory })
}

const hoverSource = `import module, { type ModuleOptions } from 'nuxt-files-sdk'
import { defineFilesConfig, type FilesConfigInput, type SingleFilesConfig, type StorageConfig } from 'nuxt-files-sdk/config'
import { useServerFiles as importedUseServerFiles } from 'nuxt-files-sdk/runtime'
import { useServerFiles as aliasedUseServerFiles } from '#imports'

void /*module*/module
const config = /*define*/defineFilesConfig({
  storage: { adapter: 'fs', config: { root: '.data/files' } },
  $development: { storage: { adapter: 'memory' } },
})
declare const documentedConfig: SingleFilesConfig
void documentedConfig./*storage*/storage
declare const documentedInput: FilesConfigInput
void documentedInput./*environment*/$development
declare const documentedStorage: StorageConfig
void documentedStorage./*adapter*/adapter
void documentedStorage./*providerConfig*/config
void /*imported*/importedUseServerFiles()
void /*aliased*/aliasedUseServerFiles()
void /*global*/useServerFiles()
const options: ModuleOptions = {
  /*moduleConfig*/config: 'files.config.ts',
  /*devtools*/devtools: { write: false },
}
void options
`

export const checkHoverDocumentation = async (directory: string): Promise<void> => {
    const docsDirectory = resolve(directory, '.contract-docs')
    const sourcePath = resolve(docsDirectory, 'hover.ts')
    const configPath = resolve(docsDirectory, 'tsconfig.json')
    await rm(docsDirectory, { recursive: true, force: true })
    await mkdir(docsDirectory, { recursive: true })
    await Promise.all([
        writeFile(sourcePath, hoverSource),
        writeFile(
            configPath,
            JSON.stringify({
                extends: '../.nuxt/tsconfig.server.json',
                include: [
                    '../.nuxt/types/nitro.d.ts',
                    '../.nuxt/nuxt.server.d.ts',
                    '../.nuxt/nuxt-files-sdk/storage-registry.d.ts',
                    '../node_modules/.cache/nuxt/.nuxt/nuxt-files-sdk/storage-registry.d.ts',
                    './hover.ts',
                ],
            }),
        ),
    ])
    const child = spawn(
        process.execPath,
        [resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--lsp', '--stdio'],
        { cwd: docsDirectory, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let stderr = ''
    child.stderr.on('data', (chunk) => (stderr += chunk))
    const connection = createMessageConnection(
        new StreamMessageReader(child.stdout),
        new StreamMessageWriter(child.stdin),
    )
    const registration = Promise.withResolvers<void>()
    const registrationTimer = setTimeout(() => registration.resolve(), 5_000)
    connection.onRequest((method) => {
        if (method === 'client/registerCapability') registration.resolve()
        return null
    })
    child.on('error', () => connection.dispose())
    child.on('exit', () => connection.dispose())
    connection.listen()
    const request = async <T>(method: string, params?: unknown): Promise<T> => {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
            return await Promise.race([
                params === undefined ? connection.sendRequest<T>(method) : connection.sendRequest<T>(method, params),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(
                        () => reject(new Error(`TypeScript language server timed out handling ${method}.\n${stderr}`)),
                        30_000,
                    )
                }),
            ])
        } finally {
            clearTimeout(timer)
        }
    }
    try {
        await request('initialize', {
            processId: process.pid,
            rootUri: pathToFileURL(docsDirectory).href,
            capabilities: { textDocument: { hover: { contentFormat: ['markdown', 'plaintext'] } } },
        })
        await connection.sendNotification('initialized', {})
        await registration.promise
        const uri = pathToFileURL(sourcePath).href
        await connection.sendNotification('textDocument/didOpen', {
            textDocument: { uri, languageId: 'typescript', version: 1, text: hoverSource },
        })
        for (const marker of [
            'module',
            'define',
            'storage',
            'adapter',
            'providerConfig',
            'environment',
            'imported',
            'aliased',
            'global',
            'moduleConfig',
            'devtools',
        ]) {
            const offset = hoverSource.indexOf(`/*${marker}*/`) + marker.length + 4
            const lines = hoverSource.slice(0, offset).split('\n')
            const hover = await request<{ contents: string | { value: string } | (string | { value: string })[] }>(
                'textDocument/hover',
                { textDocument: { uri }, position: { line: lines.length - 1, character: lines.at(-1)?.length ?? 0 } },
            )
            const contents = Array.isArray(hover?.contents) ? hover.contents : [hover?.contents]
            const documentation = contents
                .map((content) => (typeof content === 'string' ? content : content?.value))
                .join('\n')
            expect(documentation, marker).toContain('```')
            expect(documentation.replace(/```[\s\S]*?```/gu, '').trim().length, marker).toBeGreaterThan(0)
        }
        await request('shutdown')
        await connection.sendNotification('exit')
        child.stdin.end()
        if (child.exitCode === null) {
            await new Promise<void>((resolveExit) => {
                const timer = setTimeout(() => {
                    child.kill()
                    resolveExit()
                }, 5_000)
                child.once('exit', () => {
                    clearTimeout(timer)
                    resolveExit()
                })
            })
        }
    } finally {
        clearTimeout(registrationTimer)
        connection.dispose()
        if (child.exitCode === null) child.kill()
    }
}
