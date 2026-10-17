const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)

const merge = (override: unknown, base: unknown, scope?: 'root' | 'storage' | 'entry'): unknown => {
    if (override === undefined) return base
    if (!isObject(override) || !isObject(base)) return override
    const adapter = override.adapter ?? base.adapter
    const storageEntry =
        scope === 'entry' || (scope === 'storage' && (typeof adapter === 'string' || typeof adapter === 'function'))
    const providerChanged = storageEntry && 'adapter' in override && override.adapter !== base.adapter
    const result: Record<string, unknown> = { ...base }
    if (providerChanged) delete result.config
    for (const [key, value] of Object.entries(override)) {
        result[key] = merge(
            value,
            result[key],
            scope === 'root' && key === 'storage'
                ? 'storage'
                : scope === 'storage' && !storageEntry
                  ? 'entry'
                  : undefined,
        )
    }
    return result
}

/** c12 merger with Files provider boundaries and replacement arrays. Sources are highest priority first. */
export const mergeFilesConfig = (
    ...sources: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> => {
    return sources.reduceRight<Record<string, unknown>>((base, source) => {
        const value = merge(source, base, 'root')
        return isObject(value) ? value : base
    }, {})
}
