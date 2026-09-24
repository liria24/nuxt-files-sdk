import { dirname, resolve } from 'node:path'

import { parse } from '@babel/parser'

interface SyntaxNode {
    type: string
    start: number
    end: number
    name?: string
    value?: unknown
    key?: SyntaxNode
    source?: SyntaxNode
    declaration?: SyntaxNode
    declarations?: SyntaxNode[]
    id?: SyntaxNode
    init?: SyntaxNode
    expression?: SyntaxNode
    callee?: SyntaxNode
    arguments?: SyntaxNode[]
    properties?: SyntaxNode[]
    body?: SyntaxNode[]
}

const unwrap = (node: SyntaxNode): SyntaxNode =>
    node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression' || node.type === 'ParenthesizedExpression'
        ? unwrap(node.expression!)
        : node
const keyOf = (node: SyntaxNode): string | undefined =>
    node.key?.type === 'Identifier' ? node.key.name : typeof node.key?.value === 'string' ? node.key.value : undefined

/** Remove inactive environment literals before bundling the user config. */
export const pruneFilesConfigSource = (source: string, configPath: string, environments: readonly string[]): string => {
    // Babel's node union is wider than the fields inspected here.
    // oxlint-disable typescript/no-unsafe-type-assertion
    const body = (
        parse(source, { sourceType: 'module', plugins: ['typescript'] }) as unknown as { program: SyntaxNode }
    ).program.body!
    // oxlint-enable typescript/no-unsafe-type-assertion
    const exported = body.find((node) => node.type === 'ExportDefaultDeclaration')?.declaration
    if (!exported) throw new Error('[nuxt-files-sdk:invalid-config] files.config.ts needs a default export.')
    let root = unwrap(exported)
    if (root.type === 'CallExpression') root = unwrap(root.arguments?.[0] ?? root)
    if (root.type === 'Identifier') {
        const declaration = body.flatMap((node) => node.declarations ?? []).find((node) => node.id?.name === root.name)
        if (declaration?.init) root = unwrap(declaration.init)
    }
    if (root.type !== 'ObjectExpression') {
        throw new Error('[nuxt-files-sdk:invalid-config] The default Files config must be a static object literal.')
    }
    const edits: Array<{ start: number; end: number; text: string }> = []
    const active = new Set(environments)
    for (const property of root.properties ?? []) {
        const key = keyOf(property)
        if (!key?.startsWith('$')) continue
        if (key === '$env' && property.value) {
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            const env = unwrap(property.value as SyntaxNode)
            if (env.type !== 'ObjectExpression')
                throw new Error('[nuxt-files-sdk:invalid-config] $env must be an object.')
            for (const entry of env.properties ?? []) {
                if (!active.has(keyOf(entry) ?? '')) edits.push({ start: entry.start, end: entry.end, text: '...{}' })
            }
        } else if (!active.has(key.slice(1))) {
            edits.push({ start: property.start, end: property.end, text: '...{}' })
        }
    }
    // The selected module lives under the build directory; preserve relative import resolution.
    for (const node of body) {
        if (!node.source || typeof node.source.value !== 'string' || !node.source.value.startsWith('.')) continue
        edits.push({
            start: node.source.start,
            end: node.source.end,
            text: JSON.stringify(resolve(dirname(configPath), node.source.value).replaceAll('\\', '/')),
        })
    }
    let result = source
    for (const edit of edits.toSorted((left, right) => right.start - left.start)) {
        result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
    }
    return result
}
