const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)

const merge = (override: unknown, base: unknown, path: string[]): unknown => {
    if (override === undefined) return base
    if (!isObject(override) || !isObject(base)) return override
    const providerChanged =
        path[0] === 'storage' && path.length <= 2 && 'adapter' in override && override.adapter !== base.adapter
    const result: Record<string, unknown> = { ...base }
    if (providerChanged) delete result.config
    for (const [key, value] of Object.entries(override)) {
        result[key] = merge(value, result[key], [...path, key])
    }
    return result
}

/** c12 merger with Files provider boundaries and replacement arrays. Sources are highest priority first. */
export const mergeFilesConfig = (
    ...sources: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> => {
    return sources.reduceRight<Record<string, unknown>>((base, source) => {
        const value = merge(source, base, [])
        return isObject(value) ? value : base
    }, {})
}
