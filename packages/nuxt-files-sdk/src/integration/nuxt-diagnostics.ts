import { getAddDependencyCommand, type NuxtLogger } from '@nuxt/kit'

import { reportDependencyIssues, type DependencyDiagnostic } from './diagnostics'

/** Advice only: Nuxt's installer cannot guarantee zero prompts/installs on every host. */
export const reportNuxtDependencyIssues = async (
    diagnostics: DependencyDiagnostic[],
    previous: Set<string>,
    logger: Pick<NuxtLogger, 'warn'>,
    root: string,
): Promise<void> => {
    let message: string | undefined
    reportDependencyIssues(diagnostics, previous, (value) => {
        message = value
    })
    if (!message) return
    const packages = [
        ...new Set(
            diagnostics
                .filter(
                    (entry) =>
                        entry.necessity === 'required' &&
                        (entry.status === 'missing' || entry.status === 'incompatible'),
                )
                .map((entry) => {
                    const name = entry.dependency
                        .split('/')
                        .slice(0, entry.dependency.startsWith('@') ? 2 : 1)
                        .join('/')
                    return entry.range ? `${name}@${entry.range}` : name
                }),
        ),
    ]
    if (!packages.length) {
        logger.warn(message)
        return
    }
    const command = await getAddDependencyCommand(packages, root, { dev: false }).catch(() => undefined)
    logger.warn(`${message}\n${command ? `Run: ${command}` : `Add production dependencies: ${packages.join(', ')}`}`)
}
