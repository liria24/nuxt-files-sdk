import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { expect } from 'vite-plus/test'
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node'

import { invalidTypeCases } from '../types/invalid/cases'
import { closeOwnedProcess, repositoryRoot, runCommand } from './fixture'

type TypeCheckOptions = { signal?: AbortSignal }

export const cleanTypeContracts = async (directory: string): Promise<void> => {
    invalidTypeRuns.delete(directory)
    for (const name of ['.contract-docs', '.contract-invalid', '.contract-examples', '.contract-config-autoimport']) {
        await rm(resolve(directory, name), { recursive: true, force: true })
    }
}

export const checkGeneratedTypes = async (directory: string, options: TypeCheckOptions = {}): Promise<void> => {
    options.signal?.throwIfAborted()
    const imports = await readFile(resolve(directory, '.nuxt/types/nitro-imports.d.ts'), 'utf8')
    const registry = await readFile(resolve(directory, '.nuxt/nuxt-files-sdk/registry.mjs'), 'utf8').catch(() =>
        readFile(resolve(directory, 'node_modules/.cache/nuxt/.nuxt/nuxt-files-sdk/registry.mjs'), 'utf8'),
    )
    expect(imports).not.toMatch(/node_modules\/nuxt-files-sdk\/runtime/u)
    expect(registry).not.toContain('files-sdk/loader')
    const helper = imports.match(/const defineFilesConfig: typeof import\('([^']+)'\)\.defineFilesConfig/u)?.[1]
    expect(helper, 'Nitro must retain the public configuration auto-import declaration').toBeDefined()
    const referencedConfig = helper!.startsWith('.')
        ? resolve(directory, '.nuxt/types', helper!).replaceAll('\\', '/')
        : helper!
    // Compile Nitro's generated globals directly: shared declarations can otherwise hide a broken export path.
    const contract = resolve(directory, '.contract-config-autoimport')
    await mkdir(contract, { recursive: true })
    await Promise.all([
        writeFile(
            resolve(contract, 'types.ts'),
            `import type config from '../files.config'
import { defineFilesConfig as nativeDefinition } from ${JSON.stringify(referencedConfig)}
type IsAny<T> = 0 extends 1 & T ? true : false
const helperIsAny: IsAny<typeof defineFilesConfig> = false
const configIsAny: IsAny<typeof config> = false
const inferred = nativeDefinition({ storage: { adapter: 'memory' } })
inferred.storage.adapter satisfies 'memory'
void [helperIsAny, configIsAny]
`,
        ),
        writeFile(
            resolve(contract, 'tsconfig.json'),
            JSON.stringify({
                extends: '../.nuxt/tsconfig.server.json',
                compilerOptions: { types: ['node'] },
                include: [
                    '../.nuxt/types/nitro-imports.d.ts',
                    '../.nuxt/nuxt-files-sdk/storage-registry.d.ts',
                    '../node_modules/.cache/nuxt/.nuxt/nuxt-files-sdk/storage-registry.d.ts',
                    '../files.config.ts',
                    './types.ts',
                ],
            }),
        ),
    ])
    await runCommand('bun', ['x', 'vue-tsc', '--noEmit', '-p', '.contract-config-autoimport/tsconfig.json'], {
        cwd: directory,
        ...options,
    })
}

const invalidTypeRuns = new Map<string, Promise<string>>()
const compileInvalidTypes = async (directory: string, options: TypeCheckOptions): Promise<string> => {
    options.signal?.throwIfAborted()
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
        { cwd: directory, ...options },
    ).then(
        () => '',
        (failure: unknown) => {
            options.signal?.throwIfAborted()
            return String(failure)
        },
    )
}

export const checkInvalidType = async (
    directory: string,
    { id, diagnostic }: (typeof invalidTypeCases)[number],
    options: TypeCheckOptions = {},
): Promise<void> => {
    options.signal?.throwIfAborted()
    if (!invalidTypeRuns.has(directory)) invalidTypeRuns.set(directory, compileInvalidTypes(directory, options))
    const output = await invalidTypeRuns.get(directory)!
    options.signal?.throwIfAborted()
    const errors = output
        .split('\n')
        .filter((line) => line.includes(id + '.ts('))
        .join('\n')
    expect(errors, output).toMatch(diagnostic)
}

export const checkPublicExamples = async (directory: string, options: TypeCheckOptions = {}): Promise<void> => {
    options.signal?.throwIfAborted()
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
    await runCommand('bun', ['x', 'vue-tsc', '--noEmit', '-p', '.contract-examples/tsconfig.json'], {
        cwd: directory,
        ...options,
    })
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

export const checkHoverDocumentation = async (
    directory: string,
    options: TypeCheckOptions & { onStart?: (child: ChildProcess) => void } = {},
): Promise<void> => {
    options.signal?.throwIfAborted()
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
    options.signal?.throwIfAborted()
    const child = spawn(
        process.execPath,
        [resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--lsp', '--stdio'],
        { cwd: docsDirectory, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] },
    )
    const cancelled = Promise.withResolvers<never>()
    const abort = () => cancelled.reject(options.signal?.reason ?? new Error('TypeScript hover validation cancelled'))
    options.signal?.addEventListener('abort', abort, { once: true })
    const closed = Promise.withResolvers<void>()
    child.once('close', () => closed.resolve())
    let stderr = ''
    const messages: string[] = []
    child.stderr.on('data', (chunk) => (stderr += chunk))
    const connection = createMessageConnection(
        new StreamMessageReader(child.stdout),
        new StreamMessageWriter(child.stdin),
    )
    const registration = Promise.withResolvers<void>()
    const registrationTimer = setTimeout(() => registration.resolve(), 5_000)
    connection.onNotification('window/logMessage', (message: { type: number; message: string }) => {
        messages.push(`${message.type}: ${message.message.slice(0, 2000)}`)
        if (messages.length > 20) messages.shift()
    })
    connection.onError(([error]) => messages.push(`JSON-RPC: ${error.message}`))
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
                cancelled.promise,
                params === undefined ? connection.sendRequest<T>(method) : connection.sendRequest<T>(method, params),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(
                        () =>
                            reject(
                                new Error(
                                    `TypeScript language server timed out handling ${method} (exit=${String(child.exitCode)}, signal=${String(child.signalCode)}).\n${stderr}\n${messages.join('\n')}`,
                                ),
                            ),
                        30_000,
                    )
                }),
            ])
        } finally {
            clearTimeout(timer)
        }
    }
    const notify = (method: string, params?: unknown) =>
        Promise.race([
            params === undefined ? connection.sendNotification(method) : connection.sendNotification(method, params),
            cancelled.promise,
        ])
    let failure: unknown
    let naturallyClosed = false
    try {
        options.onStart?.(child)
        await request('initialize', {
            processId: process.pid,
            rootUri: pathToFileURL(docsDirectory).href,
            capabilities: { textDocument: { hover: { contentFormat: ['markdown', 'plaintext'] } } },
            initializationOptions: { disablePushDiagnostics: true },
        })
        await notify('initialized', {})
        await Promise.race([registration.promise, cancelled.promise])
        const uri = pathToFileURL(sourcePath).href
        await notify('textDocument/didOpen', {
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
        // Let shutdown close the test buffer and session together. A separate didClose
        // schedules a snapshot update that can overlap Windows native-watcher teardown.
        expect(await request<null>('shutdown')).toBeNull()
        await notify('exit')
        let closeTimer: ReturnType<typeof setTimeout> | undefined
        try {
            await Promise.race([
                closed.promise,
                cancelled.promise,
                new Promise<never>((_, reject) => {
                    closeTimer = setTimeout(
                        () => reject(new Error('TypeScript language server did not close after exit.')),
                        5_000,
                    )
                }),
            ])
        } finally {
            clearTimeout(closeTimer)
        }
        naturallyClosed = true
    } catch (error) {
        failure = error
    } finally {
        options.signal?.removeEventListener('abort', abort)
        clearTimeout(registrationTimer)
        try {
            // Windows's public Node shim owns a native compiler child; capture it before terminating the shim.
            if (!naturallyClosed) await closeOwnedProcess(child, { cwd: docsDirectory })
        } catch (error) {
            failure = failure
                ? new AggregateError([failure, error], 'TypeScript hover validation and cleanup failed.')
                : error
        }
        connection.dispose()
        child.stdin.end()
    }
    if (failure) throw failure
}
