import { readFileSync } from 'node:fs'
import { extname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Jiti, ModuleCache, TransformOptions } from 'jiti'

// The public transform callback accepts Babel plugins. Keep this structural subset
// local rather than depending on Jiti's private Babel bundle or a hoisted package.
interface SourceNode {
    type: string
    name?: string
    value?: unknown
    source?: SourceNode
    callee?: SourceNode
    arguments?: SourceNode[]
    importKind?: string
    exportKind?: string
}
interface SourcePath {
    node: SourceNode
    parentPath?: SourcePath
    scope: { getBinding(name: string): unknown }
    replaceWith(node: SourceNode): void
    skip(): void
    traverse(visitors: Record<string, (path: SourcePath) => void>): void
}
interface SourceTypes {
    stringLiteral(value: string): SourceNode
    identifier(value: string): SourceNode
    callExpression(callee: SourceNode, args: SourceNode[]): SourceNode
    memberExpression(object: SourceNode, property: SourceNode): SourceNode
}

interface ConfigEvaluatorOptions {
    alias: Record<string, string>
    nativeRoots: string[]
}

const normalize = (path: string) => {
    const normalized = path.replaceAll('\\', '/').replace(/\/$/u, '')
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/** Create one fresh source graph per c12 load, retaining Jiti's resolver and compiler. */
export const createFilesConfigEvaluator = async ({ alias, nativeRoots }: ConfigEvaluatorOptions) => {
    const { createJiti } = await import('jiti')
    const cache: ModuleCache = Object.create(null)
    const virtualModules: Record<string, unknown> = Object.create(null)
    const instances = new Map<string, Jiti>()
    const requires = new Map<string, Jiti>()
    const pending = new Map<string, Promise<unknown>>()
    const results = new Map<string, unknown>()
    const failures = new Map<string, unknown>()
    const dependencies = new Map<string, Set<string>>()
    const bridgeId = 'nuxt-files-sdk:config-source-bridge'
    const roots = nativeRoots.map(normalize)
    const sourceSpecifier = (id: string) =>
        id.startsWith('.') ||
        isAbsolute(id) ||
        id.startsWith('file:') ||
        Object.keys(alias).some((key) => id === key || id.startsWith(`${key}/`))
    const sourceFile = (id: string, filename: string) =>
        sourceSpecifier(id) &&
        /^\.[cm]?[jt]sx?$/u.test(extname(filename)) &&
        !roots.some((root) => normalize(filename) === root || normalize(filename).startsWith(`${root}/`))

    const callBridge = (types: SourceTypes, method: string, args: SourceNode[]) =>
        types.callExpression(
            types.memberExpression(
                types.callExpression(types.identifier('require'), [types.stringLiteral(bridgeId)]),
                types.identifier(method),
            ),
            args,
        )

    const rewriteImports =
        (opts: TransformOptions) =>
        ({ types }: { types: SourceTypes }) => ({
            visitor: {
                Program: {
                    enter(path: SourcePath) {
                        const origin = opts.filename
                        if (!origin) throw new Error('[nuxt-files-sdk:config-source] Missing source filename.')
                        const rewriteStatic = ({ node }: SourcePath) => {
                            if (
                                typeof node.source?.value === 'string' &&
                                node.importKind !== 'type' &&
                                node.exportKind !== 'type'
                            )
                                node.source.value = virtualize(node.source.value, origin, !!opts.async)
                        }
                        path.traverse({
                            ImportDeclaration: rewriteStatic,
                            ExportNamedDeclaration: rewriteStatic,
                            ExportAllDeclaration: rewriteStatic,
                            CallExpression(reference) {
                                const argument = reference.node.arguments?.[0]
                                if (reference.node.callee?.type === 'Import' && argument)
                                    reference.replaceWith(
                                        callBridge(types, 'importFrom', [argument, types.stringLiteral(origin)]),
                                    )
                            },
                            ReferencedIdentifier(reference) {
                                if (reference.node.name !== 'require' || reference.scope.getBinding('require')) return
                                const parent = reference.parentPath?.node
                                if (
                                    parent?.type === 'CallExpression' &&
                                    parent.callee === reference.node &&
                                    parent.arguments?.[0]?.value === bridgeId
                                )
                                    return
                                reference.replaceWith(callBridge(types, 'requireFor', [types.stringLiteral(origin)]))
                                reference.skip()
                            },
                        })
                    },
                },
            },
        })

    function instance(filename: string): Jiti {
        const existing = instances.get(filename)
        if (existing) return existing
        const jiti = createJiti(filename, {
            alias,
            virtualModules,
            interopDefault: true,
            moduleCache: false,
            tryNative: false,
            nativeModules: ['files-sdk'],
            // The transform registers virtual entries for this graph; an old transform
            // cache cannot recreate those getters in a new evaluation.
            fsCache: false,
        })
        const transform = jiti.options.transform
        if (!transform) throw new Error('[nuxt-files-sdk:config-source] Jiti has no source transformer.')
        jiti.options.transform = (opts) =>
            transform({
                ...opts,
                babel: { ...opts.babel, plugins: [...(opts.babel?.plugins ?? []), rewriteImports(opts)] },
            })
        instances.set(filename, jiti)
        return jiti
    }

    function virtualize(id: string, origin: string, async: boolean): string {
        if (!sourceSpecifier(id)) return id
        const key = `${bridgeId}:${async}:${JSON.stringify([origin, id])}`
        if (!(key in virtualModules))
            Object.defineProperty(virtualModules, key, {
                enumerable: true,
                get: () => (async ? importFrom(id, origin) : requireFrom(id, origin)),
            })
        return key
    }

    function reaches(from: string, target: string, visited = new Set<string>()): boolean {
        if (from === target) return true
        if (visited.has(from)) return false
        visited.add(from)
        return [...(dependencies.get(from) ?? [])].some((next) => reaches(next, target, visited))
    }

    function evaluate(filename: string, async: boolean, source?: string): unknown {
        if (failures.has(filename)) throw failures.get(filename)
        if (results.has(filename)) return results.get(filename)
        // Jiti inserts its real Module into this public cache before running the code.
        // Synchronous requires and circular imports retain its partial-export behavior.
        if (cache[filename]) return cache[filename].exports
        try {
            const result = instance(filename).evalModule(source ?? readFileSync(filename, 'utf8'), {
                filename,
                async,
                forceTranspile: true,
                cache,
            })
            if (!async) {
                results.set(filename, result)
                return result
            }
            const completion = Promise.resolve(result).then(
                (value) => {
                    results.set(filename, value)
                    pending.delete(filename)
                    return value
                },
                (error: unknown) => {
                    failures.set(filename, error)
                    pending.delete(filename)
                    throw error
                },
            )
            pending.set(filename, completion)
            return completion
        } catch (error) {
            failures.set(filename, error)
            throw error
        }
    }

    async function importFrom(id: string, origin: string): Promise<unknown> {
        const jiti = instance(origin)
        const url = jiti.esmResolve(id)
        if (!url.startsWith('file:')) return jiti.import(id)
        const filename = fileURLToPath(url)
        if (!sourceFile(id, filename)) return jiti.import(id)
        const circular = reaches(filename, origin)
        const edges = dependencies.get(origin) ?? new Set<string>()
        edges.add(filename)
        dependencies.set(origin, edges)
        // Await another import's evaluation unless that would deadlock a cycle.
        return (!circular && pending.get(filename)) || evaluate(filename, true)
    }

    function requireFrom(id: string, origin: string): unknown {
        const jiti = instance(origin)
        const filename = jiti.resolve(id)
        return sourceFile(id, filename) ? evaluate(filename, false) : jiti(id)
    }

    function requireFor(origin: string): Jiti {
        const existing = requires.get(origin)
        if (existing) return existing
        // Preserve resolve/cache/extensions/main and captured require aliases.
        const wrapped = new Proxy(instance(origin), {
            apply: (_target, _this, args: [string]) => requireFrom(args[0], origin),
        })
        requires.set(origin, wrapped)
        return wrapped
    }

    virtualModules[bridgeId] = { importFrom, requireFor }
    return async (filename: string, source?: string): Promise<unknown> => evaluate(filename, true, source)
}
