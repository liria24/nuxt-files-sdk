import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { parseSync } from 'oxc-parser'

import type { DependencyRequirement } from './dependencies'
import { sdkEntry, type PackageInfo } from './resolve'

/** Runtime imports only; type-only references never require optional SDK installation. */
export const sourceImports = (filename: string, source: string): string[] => {
    const { module } = parseSync(filename, source)
    return [...new Set([
        ...module.staticImports.filter((entry) => !entry.entries.length || entry.entries.some((binding) => !binding.isType)).map((entry) => entry.moduleRequest.value),
        ...module.staticExports.flatMap((entry) => entry.entries.filter((binding) => !binding.isType && binding.moduleRequest).map((binding) => binding.moduleRequest!.value)),
    ])]
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
                const name = specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/')
                if (sdk.manifest.peerDependencies?.[name]) found.add(specifier)
            }
        }
    }
    visit(sdkEntry(sdk, subpath))
    return [...found].map((dependency) => ({ subpath, dependency, necessity: 'required', stage: 'import', reason: 'Static public SDK import' }))
}
