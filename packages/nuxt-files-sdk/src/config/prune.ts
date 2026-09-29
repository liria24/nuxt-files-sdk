import { dirname, resolve } from 'node:path'

import { parseSync, type Node, type ObjectPropertyKind } from 'oxc-parser'

const unwrap = (node: Node): Node =>
    node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression' || node.type === 'ParenthesizedExpression'
        ? unwrap(node.expression)
        : node
const keyOf = (node: ObjectPropertyKind): string | undefined =>
    node.type !== 'Property'
        ? undefined
        : node.key.type === 'Identifier' && !node.computed
          ? node.key.name
          : node.key.type === 'Literal' && typeof node.key.value === 'string'
            ? node.key.value
            : undefined

/** Remove inactive environment literals before bundling the user config. */
export const pruneFilesConfigSource = (source: string, configPath: string, environments: readonly string[]): string => {
    const parsed = parseSync(configPath, source, { sourceType: 'module', lang: 'ts' })
    if (parsed.errors.length > 0) {
        throw new Error(`[nuxt-files-sdk:invalid-config] ${parsed.errors[0]!.message}`)
    }
    const body = parsed.program.body
    const exported = body.find((node) => node.type === 'ExportDefaultDeclaration')?.declaration
    if (!exported) throw new Error('[nuxt-files-sdk:invalid-config] files.config.ts needs a default export.')
    let root = unwrap(exported)
    if (root.type === 'CallExpression') root = unwrap(root.arguments[0] ?? root)
    if (root.type === 'Identifier') {
        const name = root.name
        const declaration = body
            .flatMap((node) => (node.type === 'VariableDeclaration' ? node.declarations : []))
            .find((node) => node.id.type === 'Identifier' && node.id.name === name)
        if (declaration?.init) root = unwrap(declaration.init)
    }
    if (root.type !== 'ObjectExpression') {
        throw new Error('[nuxt-files-sdk:invalid-config] The default Files config must be a static object literal.')
    }
    const edits: Array<{ start: number; end: number; text: string }> = []
    const active = new Set(environments)
    for (const property of root.properties) {
        const key = keyOf(property)
        if (!key?.startsWith('$')) continue
        if (key === '$env' && property.type === 'Property') {
            const env = unwrap(property.value)
            if (env.type !== 'ObjectExpression')
                throw new Error('[nuxt-files-sdk:invalid-config] $env must be an object.')
            for (const entry of env.properties) {
                if (!active.has(keyOf(entry) ?? '')) edits.push({ start: entry.start, end: entry.end, text: '...{}' })
            }
        } else if (!active.has(key.slice(1))) {
            edits.push({ start: property.start, end: property.end, text: '...{}' })
        }
    }
    // The selected module lives under the build directory; preserve relative import resolution.
    for (const node of body) {
        if (!('source' in node) || !node.source || !node.source.value.startsWith('.')) continue
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
