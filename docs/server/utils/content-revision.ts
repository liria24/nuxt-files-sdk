export interface RevisionState {
    activeSha: string
    checkedAt: number
}

export const isFreshRevision = (state: RevisionState | undefined, now: number, interval: number) =>
    Boolean(state && now - state.checkedAt < interval)

export const isRevisionState = (value: unknown): value is RevisionState => {
    if (!value || typeof value !== 'object' || !('activeSha' in value) || !('checkedAt' in value)) return false
    return typeof value.activeSha === 'string' && isCommitSha(value.activeSha) && typeof value.checkedAt === 'number'
}

export const isCommitSha = (value: string) => /^[a-f0-9]{40,64}$/u.test(value)

export const isAuthorizedDocsRevalidation = (authorization: string | undefined, token: string | undefined) =>
    Boolean(token && authorization === `Bearer ${token}`)

export async function revalidateContentRevision(
    requestedSha: string,
    steps: {
        latest: () => Promise<string>
        validate: () => Promise<void>
        save: () => Promise<void>
        purge: () => Promise<{ success: boolean }>
    },
): Promise<boolean> {
    if ((await steps.latest()) !== requestedSha) return false
    await steps.validate()
    await steps.save()
    if (!(await steps.purge()).success) throw new Error('Cloudflare cache purge failed.')
    return true
}

export async function fetchContentSha(options: {
    repository: string
    branch: string
    contentDir: string
    token?: string
    fetch?: typeof globalThis.fetch
}): Promise<string> {
    const fetcher = options.fetch ?? globalThis.fetch
    const url = new URL(`https://api.github.com/repos/${options.repository}/commits`)
    url.searchParams.set('sha', options.branch)
    url.searchParams.set('path', options.contentDir)
    url.searchParams.set('per_page', '1')

    const response = await fetcher(url, {
        headers: {
            accept: 'application/vnd.github+json',
            'user-agent': 'nuxt-files-sdk-docs',
            'x-github-api-version': '2022-11-28',
            ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        },
    })
    if (!response.ok) throw new Error(`GitHub content revision request failed with ${response.status}.`)

    const commits: unknown = await response.json()
    const first = Array.isArray(commits) ? commits[0] : undefined
    const sha = first && typeof first === 'object' && 'sha' in first ? first.sha : undefined
    if (typeof sha !== 'string' || !isCommitSha(sha)) throw new Error('GitHub returned no valid content revision.')
    return sha
}
