import { docsCacheTag } from '../../utils/cache-policy'
import { getDocsEnvironment, saveDocsRevision, validateDocsRevision } from '../../utils/content'
import {
    fetchContentSha,
    isAuthorizedDocsRevalidation,
    isCommitSha,
    revalidateContentRevision,
} from '../../utils/content-revision'

export default defineEventHandler(async (event) => {
    const environment = getDocsEnvironment(event.context)
    if (!environment.DOCS_REVALIDATE_TOKEN) {
        throw createError({ statusCode: 503, statusMessage: 'Docs revalidation is unavailable.' })
    }
    if (!isAuthorizedDocsRevalidation(getHeader(event, 'authorization'), environment.DOCS_REVALIDATE_TOKEN)) {
        throw createError({ statusCode: 401, statusMessage: 'Unauthorized.' })
    }

    const body: unknown = await readBody(event)
    const sha = body && typeof body === 'object' && 'sha' in body ? body.sha : undefined
    if (typeof sha !== 'string' || !isCommitSha(sha)) {
        throw createError({ statusCode: 400, statusMessage: 'A valid content commit SHA is required.' })
    }

    const cloudflare: unknown = event.context.cloudflare
    const workerContext =
        cloudflare && typeof cloudflare === 'object' && 'context' in cloudflare ? cloudflare.context : undefined
    const cache =
        workerContext && typeof workerContext === 'object' && 'cache' in workerContext ? workerContext.cache : undefined
    if (!isDocsCache(cache)) throw createError({ statusCode: 503, statusMessage: 'Workers Cache is unavailable.' })

    const config = useRuntimeConfig(event).docs
    const updated = await revalidateContentRevision(sha, {
        latest: () => fetchContentSha({ ...config, token: environment.GITHUB_TOKEN }),
        validate: () => validateDocsRevision(event, sha),
        save: () => saveDocsRevision(event, sha),
        purge: () => cache.purge({ tags: [docsCacheTag] }),
    })
    if (!updated) throw createError({ statusCode: 409, statusMessage: 'The content revision is no longer current.' })
    return { activeSha: sha }
})

function isDocsCache(
    value: unknown,
): value is { purge: (options: { tags: string[] }) => Promise<{ success: boolean }> } {
    return Boolean(value && typeof value === 'object' && 'purge' in value && typeof value.purge === 'function')
}
