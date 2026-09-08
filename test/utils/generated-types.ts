import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { expect } from 'vitest'

import { invalidTypeCases } from '../types/invalid/cases'
import { repositoryRoot, runCommand } from './fixture'

export const cleanTypeContracts = async (directory: string): Promise<void> => {
    for (const name of ['.contract-docs', '.contract-invalid', '.contract-examples']) {
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

const hoverSource = `import module, { type ModuleOptions } from 'nuxt-files-sdk'
import { defineFilesConfig, type FilesConfig, type StorageConfig } from 'nuxt-files-sdk/config'
import { FilesRegistry, useServerFiles as importedUseServerFiles } from 'nuxt-files-sdk/runtime'
import { useServerFiles as aliasedUseServerFiles } from '#imports'

void /*module*/module
const config = /*define*/defineFilesConfig({
  default: 'archive',
  storage: {
    archive: { adapter: 'fs' },
  },
  devStorage: { archive: { adapter: 'fs' } },
})
declare const documentedConfig: FilesConfig
void documentedConfig./*default*/default
void documentedConfig./*storage*/storage
void documentedConfig./*devStorage*/devStorage
declare const documentedStorage: StorageConfig
void documentedStorage./*adapter*/adapter
void new /*registry*/FilesRegistry(config)./*get*/get()
void /*imported*/importedUseServerFiles()
void /*aliased*/aliasedUseServerFiles()
void /*global*/useServerFiles()
const options: ModuleOptions = {
  /*moduleConfig*/config: 'files.config.ts',
  /*devtools*/devtools: true,
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
                include: ['../.nuxt/types/nitro.d.ts', '../.nuxt/nuxt-files-sdk/storage-registry.d.ts', './hover.ts'],
            }),
        ),
    ])
    const child = spawn(
        process.execPath,
        [resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--lsp', '--stdio'],
        { cwd: docsDirectory, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let buffer = Buffer.alloc(0)
    let stderr = ''
    let nextId = 0
    const serverMessages: string[] = []
    let registrationReady: (() => void) | undefined
    const registration = new Promise<void>((resolveRegistration) => {
        const timer = setTimeout(resolveRegistration, 5_000)
        registrationReady = () => {
            clearTimeout(timer)
            resolveRegistration()
        }
    })
    type Response = {
        id?: number | string
        method?: string
        params?: unknown
        result?: unknown
        error?: { message: string }
    }
    const pending = new Map<number, (response: Response) => void>()
    const fail = (message: string): void => {
        for (const respond of pending.values()) respond({ id: -1, error: { message } })
        pending.clear()
    }
    child.on('error', (error) => fail(error.message))
    child.on('exit', (code) => fail(`TypeScript language server exited (${code}).`))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.stdout.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk])
        for (let headerEnd = buffer.indexOf('\r\n\r\n'); headerEnd >= 0; headerEnd = buffer.indexOf('\r\n\r\n')) {
            const length = Number(/Content-Length: (\d+)/iu.exec(buffer.subarray(0, headerEnd).toString())?.[1])
            const end = headerEnd + 4 + length
            if (buffer.length < end) return
            const response = JSON.parse(buffer.subarray(headerEnd + 4, end).toString()) as Response
            buffer = buffer.subarray(end)
            if (response.method) serverMessages.push(`${response.method}: ${JSON.stringify(response.params)}`)
            if (typeof response.id === 'number' && pending.has(response.id)) pending.get(response.id)?.(response)
            else if ((typeof response.id === 'number' || typeof response.id === 'string') && response.method) {
                send({ jsonrpc: '2.0', id: response.id, result: null })
                if (response.method === 'client/registerCapability') registrationReady?.()
            }
        }
    })
    const send = (message: object): void => {
        const body = JSON.stringify(message)
        child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
    }
    const request = <T>(method: string, params?: unknown): Promise<T> =>
        new Promise((resolveRequest, reject) => {
            const id = ++nextId
            const timer = setTimeout(() => {
                pending.delete(id)
                reject(
                    new Error(
                        `TypeScript language server timed out handling ${method}.\n${serverMessages.join('\n')}\n${stderr}`,
                    ),
                )
            }, 30_000)
            pending.set(id, (response) => {
                clearTimeout(timer)
                pending.delete(id)
                if (response.error) reject(new Error(response.error.message))
                else resolveRequest(response.result as T)
            })
            send({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })
        })
    try {
        await request('initialize', {
            processId: process.pid,
            rootUri: pathToFileURL(docsDirectory).href,
            capabilities: { textDocument: { hover: { contentFormat: ['markdown', 'plaintext'] } } },
        })
        send({ jsonrpc: '2.0', method: 'initialized', params: {} })
        await registration
        const uri = pathToFileURL(sourcePath).href
        send({
            jsonrpc: '2.0',
            method: 'textDocument/didOpen',
            params: { textDocument: { uri, languageId: 'typescript', version: 1, text: hoverSource } },
        })
        for (const [marker, expected] of Object.entries({
            module: 'Install Files SDK storage configuration',
            define: 'Define a Files SDK configuration',
            default: 'Storage used by',
            storage: 'Named storages',
            adapter: 'Files SDK provider slug',
            devStorage: 'Development-only connection overrides',
            registry: 'Create a registry and validate storage references',
            get: 'Return the default storage',
            imported: "Return the project's default Files client",
            aliased: "Return the project's default Files client",
            global: "Return the project's default Files client",
            moduleConfig: 'Path to the Files configuration module',
            devtools: 'Enable Files SDK development diagnostics',
        })) {
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
            expect(documentation, marker).toContain(expected)
        }
        await request('shutdown')
        send({ jsonrpc: '2.0', method: 'exit' })
        if (child.exitCode === null) {
            await new Promise<void>((resolveExit, reject) => {
                const timer = setTimeout(() => reject(new Error('TypeScript language server did not exit.')), 5_000)
                child.once('exit', () => {
                    clearTimeout(timer)
                    resolveExit()
                })
            })
        }
    } finally {
        if (child.exitCode === null) child.kill()
    }
}
