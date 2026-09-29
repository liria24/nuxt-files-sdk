import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { resolveModulePath } from 'exsolve'
import { parseSync } from 'oxc-parser'

import type { DependencyRequirement } from './dependencies'
import { sdkEntry, type PackageInfo } from './resolve'

/** Follow local and Layer imports from their actual importer, without discovering/merging configs. */
export const configSources = (filename: string, aliases: Record<string, string> = {}) => {
    const files = new Set<string>()
    const sdkImports = new Set<string>()
    const visit = (path: string) => {
        path = resolve(path)
        if (files.has(path)) return
        files.add(path)
        let source: string
        try {
            source = readFileSync(path, 'utf8')
        } catch {
            return
        }
        for (const specifier of sourceImports(path, source)) {
            if (specifier === '#files-sdk' || specifier.startsWith('#files-sdk/')) {
                sdkImports.add(specifier.slice(1))
                continue
            }
            const alias = Object.keys(aliases)
                .toSorted((a, b) => b.length - a.length)
                .find((key) => specifier === key || specifier.startsWith(`${key}/`))
            const target = alias ? aliases[alias]! + specifier.slice(alias.length) : specifier
            if (!target.startsWith('.') && !isAbsolute(target)) continue
            const entry = resolveModulePath(target, {
                from: pathToFileURL(path),
                cache: false,
                try: true,
                extensions: ['.ts', '.mts', '.js', '.mjs', '.cts', '.cjs', '.json'],
                suffixes: ['', '/index'],
            })
            if (entry) visit(entry)
            else files.add(resolve(dirname(path), target))
        }
    }
    visit(filename)
    return { files: [...files], sdkImports: [...sdkImports] }
}

/** Runtime imports only; type-only references never require optional SDK installation. */
export const sourceImports = (filename: string, source: string): string[] => {
    const { module } = parseSync(filename, source)
    return [
        ...new Set([
            ...module.staticImports
                .filter((entry) => !entry.entries.length || entry.entries.some((binding) => !binding.isType))
                .map((entry) => entry.moduleRequest.value),
            ...module.staticExports.flatMap((entry) =>
                entry.entries
                    .filter((binding) => !binding.isType && binding.moduleRequest)
                    .map((binding) => binding.moduleRequest!.value),
            ),
        ]),
    ]
}

/** Read the selected public entry's static graph; never import or execute it. */
export const subpathDependencies = (sdk: PackageInfo, subpath: string): DependencyRequirement[] => {
    const seen = new Set<string>()
    const found = new Set<string>()
    const visit = (filename: string) => {
        if (seen.has(filename)) return
        seen.add(filename)
        for (const specifier of sourceImports(filename, readFileSync(filename, 'utf8'))) {
            if (specifier.startsWith('.')) visit(resolve(dirname(filename), specifier))
            else {
                const name = specifier
                    .split('/')
                    .slice(0, specifier.startsWith('@') ? 2 : 1)
                    .join('/')
                if (sdk.manifest.peerDependencies?.[name]) found.add(specifier)
            }
        }
    }
    visit(sdkEntry(sdk, subpath))
    return [...found].map((dependency) => ({
        subpath,
        dependency,
        necessity: 'required',
        stage: 'import',
        reason: 'Static public SDK import',
    }))
}
