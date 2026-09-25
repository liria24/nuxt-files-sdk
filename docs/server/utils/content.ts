import rangi from '@comark/nuxt/plugins/rangi'
import security from '@comark/nuxt/plugins/security'
import toc from '@comark/nuxt/plugins/toc'
import { comarkContent, type AnyComarkContent, type ContentSource } from 'comark-content'
import yaml from 'comark-content/plugins/yaml'
import fs from 'comark-content/sources/fs'
import github from 'comark-content/sources/github'
import snapshot from 'comark-content/sources/snapshot'
import breaks from 'comark/plugins/breaks'
import type { H3Event } from 'h3'
import cloudflareKVBinding from 'unstorage/drivers/cloudflare-kv-binding'

import { fetchContentSha, isRevisionState, selectDocsContent, type RevisionState } from './content-revision'
import { buildSearchSections, invalidateSearchSections } from './search'
import { recordDocsTiming } from './timing'

interface DocsKV {
    get(key: string, type: 'json'): Promise<unknown>
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

interface DocsEnvironment {
    DOCS_CACHE?: DocsKV
    GITHUB_TOKEN?: string
}

interface ProductionContentConfig {
    repository: string
    branch: string
    contentDir: string
}

const parserVersion = 'v1'
const revisionStateKey = `docs:${parserVersion}:revision`
const contentCacheTtlSeconds = 60 * 60 * 24 * 30
const instances = new Map<string, Promise<AnyComarkContent>>()

let developmentContent: Promise<AnyComarkContent> | undefined
let productionBase: AnyComarkContent | undefined
let localRevision: RevisionState | undefined
let revisionRefresh: Promise<AnyComarkContent> | undefined

const markdownPlugins = [
    rangi(),
    toc({ depth: 3 }),
    security({
        blockedTags: ['script', 'iframe', 'embed', 'form', 'base', 'meta', 'link', 'style'],
        allowDataImages: false,
    }),
    breaks(),
]

export async function getDocsContent(event: H3Event): Promise<AnyComarkContent> {
    if (import.meta.dev) return getDevelopmentContent()

    const environment = getDocsEnvironment(event.context)
    const binding = environment.DOCS_CACHE
    if (!binding) {
        throw createError({ statusCode: 503, statusMessage: 'The DOCS_CACHE binding is unavailable.' })
    }
    const readyEnvironment = { ...environment, DOCS_CACHE: binding }

    const config = useRuntimeConfig(event).docs
    const refreshInterval: number = globalThis.Number(config.refreshInterval)
    const now = Date.now()
    if (!localRevision) {
        const revisionStarted = performance.now()
        const persisted = await readRevision(binding)
        recordDocsTiming(event, 'docs-revision', revisionStarted)
        if (persisted) localRevision = persisted
    }

    const timing = (name: string, started: number) => recordDocsTiming(event, name, started)
    const refresh = (foreground = false) => {
        revisionRefresh ??= refreshProductionContent(
            readyEnvironment,
            {
                repository: config.repository,
                branch: config.branch,
                contentDir: config.contentDir,
                refreshInterval,
            },
            foreground ? timing : undefined,
        ).finally(() => {
            revisionRefresh = undefined
        })
        return revisionRefresh
    }
    try {
        return await selectDocsContent({
            state: localRevision,
            now,
            refreshInterval,
            load: async (sha) => {
                const started = performance.now()
                try {
                    return await contentAt(sha, readyEnvironment, config, timing)
                } finally {
                    timing('docs-content', started)
                }
            },
            refresh: async () => {
                const started = performance.now()
                try {
                    return await refresh(true)
                } finally {
                    timing('docs-refresh', started)
                }
            },
            refreshInBackground: () => {
                event.waitUntil(
                    refresh().catch((error: unknown) => {
                        // oxlint-disable-next-line no-console -- surfaced in Cloudflare Worker logs
                        console.error('[docs] Background content revision check failed.', error)
                    }),
                )
            },
            onLoadError: (error) => {
                // oxlint-disable-next-line no-console -- surfaced in Cloudflare Worker logs
                console.error('[docs] Failed to hydrate the cached content revision.', error)
            },
        })
    } catch (error) {
        setResponseHeader(event, 'retry-after', Math.ceil(refreshInterval / 1000))
        throw error
    }
}

async function getDevelopmentContent(): Promise<AnyComarkContent> {
    if (!developmentContent) {
        const { contentPath } = useRuntimeConfig().docs
        const content = createContent(fs(contentPath))
        developmentContent = content
            .init({ partial: false })
            .then(async () => {
                await buildSearchSections(content)
                await content.watch()
                content.hooks.hook('watch:file:update', () => void invalidateSearchSections(content))
                content.hooks.hook('watch:file:remove', () => void invalidateSearchSections(content))
                return content
            })
            .catch((error) => {
                developmentContent = undefined
                throw error
            })
    }
    return developmentContent
}

async function refreshProductionContent(
    environment: Required<Pick<DocsEnvironment, 'DOCS_CACHE'>> & DocsEnvironment,
    config: ProductionContentConfig & { refreshInterval: number },
    timing?: (name: string, started: number) => void,
): Promise<AnyComarkContent> {
    const checkedAt = Date.now()
    try {
        const githubStarted = performance.now()
        const sha = await fetchContentSha({ ...config, token: environment.GITHUB_TOKEN })
        timing?.('docs-github', githubStarted)
        const content = await contentAt(sha, environment, config, timing)
        const next = { activeSha: sha, checkedAt }
        localRevision = next
        await writeRevision(environment.DOCS_CACHE, next).catch(logCacheError)
        return content
    } catch (error) {
        // oxlint-disable-next-line no-console -- surfaced in Cloudflare Worker logs
        console.error('[docs] Failed to activate the latest GitHub content revision.', error)
        if (localRevision?.activeSha) {
            const fallback = { ...localRevision, checkedAt }
            localRevision = fallback
            await writeRevision(environment.DOCS_CACHE, fallback).catch(logCacheError)
            try {
                return await contentAt(fallback.activeSha, environment, config)
            } catch (fallbackError) {
                // oxlint-disable-next-line no-console -- surfaced in Cloudflare Worker logs
                console.error('[docs] Failed to load the last-known-good content revision.', fallbackError)
            }
        }
        throw createError({
            statusCode: 503,
            statusMessage: 'Documentation content is temporarily unavailable.',
        })
    }
}

function contentAt(
    sha: string,
    environment: Required<Pick<DocsEnvironment, 'DOCS_CACHE'>> & DocsEnvironment,
    config: ProductionContentConfig = useRuntimeConfig().docs,
    timing?: (name: string, started: number) => void,
): Promise<AnyComarkContent> {
    const existing = instances.get(sha)
    if (existing) return existing

    const promise = (async () => {
        const snapshotStarted = performance.now()
        const stored = await environment.DOCS_CACHE.get(snapshotKey(sha), 'json').catch(logCacheError)
        timing?.('docs-snapshot', snapshotStarted)
        if (stored) {
            try {
                const initStarted = performance.now()
                const content = await validateContent(createContent(snapshot(() => stored)).withRef(sha))
                timing?.('docs-init', initStarted)
                return content
            } catch (error) {
                // oxlint-disable-next-line no-console -- fall back to the pinned GitHub source
                console.error('[docs] Failed to hydrate the stored content snapshot.', error)
            }
        }

        productionBase ??= createContent(
            github({
                repo: config.repository,
                branch: config.branch,
                path: config.contentDir,
                token: environment.GITHUB_TOKEN,
                ttl: contentCacheTtlSeconds,
            }),
            cacheDriver(environment.DOCS_CACHE),
        )
        const initStarted = performance.now()
        const content = await validateContent(productionBase.withRef(sha))
        timing?.('docs-init', initStarted)
        const writeStarted = performance.now()
        await environment.DOCS_CACHE.put(snapshotKey(sha), JSON.stringify(await content.snapshot()), {
            expirationTtl: contentCacheTtlSeconds,
        })
        timing?.('docs-snapshot-write', writeStarted)
        return content
    })().catch((error) => {
        instances.delete(sha)
        throw error
    })
    instances.set(sha, promise)

    while (instances.size > 2) instances.delete(instances.keys().next().value!)
    return promise
}

const createContent = (source: ContentSource, driver?: ReturnType<typeof cacheDriver>) =>
    comarkContent({
        source,
        markdown: { plugins: markdownPlugins },
        plugins: [yaml({ onError: 'throw' })],
        cache: driver ? { driver, swr: false } : undefined,
        basePath: '/api/content',
        onError: 'throw',
    })

async function validateContent(content: AnyComarkContent): Promise<AnyComarkContent> {
    await content.init({ partial: false })
    const [navigation, sections] = await Promise.all([content.navigation(), buildSearchSections(content)])
    if (navigation.length === 0 || sections.length === 0) throw new Error('The content revision is incomplete.')
    return content
}

function cacheDriver(binding: DocsKV) {
    const driver = cloudflareKVBinding({
        binding,
        base: `docs:${parserVersion}:content:`,
        minTTL: 60,
    })
    const setItem = driver.setItem!.bind(driver)
    driver.setItem = (key, value, options) => setItem(key, value, { ...options, ttl: contentCacheTtlSeconds })
    return driver
}

async function readRevision(binding: DocsKV): Promise<RevisionState | undefined> {
    const value = await binding.get(revisionStateKey, 'json').catch(logCacheError)
    return isRevisionState(value) ? value : undefined
}

const writeRevision = (binding: DocsKV, state: RevisionState) => binding.put(revisionStateKey, JSON.stringify(state))

const snapshotKey = (sha: string) => `docs:${parserVersion}:snapshot:${sha}`

function logCacheError(error: unknown) {
    // oxlint-disable-next-line no-console -- cache failures are non-fatal but operationally relevant
    console.warn('[docs] Cloudflare KV cache operation failed.', error)
    return undefined
}

function getDocsEnvironment(context: unknown): DocsEnvironment {
    if (!context || typeof context !== 'object' || !('cloudflare' in context)) return {}
    const cloudflare = context.cloudflare
    if (!cloudflare || typeof cloudflare !== 'object' || !('env' in cloudflare)) return {}
    const environment = cloudflare.env
    if (!environment || typeof environment !== 'object') return {}

    const DOCS_CACHE =
        'DOCS_CACHE' in environment && isDocsKV(environment.DOCS_CACHE) ? environment.DOCS_CACHE : undefined
    const GITHUB_TOKEN =
        'GITHUB_TOKEN' in environment && typeof environment.GITHUB_TOKEN === 'string'
            ? environment.GITHUB_TOKEN
            : undefined
    return { DOCS_CACHE, GITHUB_TOKEN }
}

function isDocsKV(value: unknown): value is DocsKV {
    return Boolean(
        value &&
        typeof value === 'object' &&
        'get' in value &&
        typeof value.get === 'function' &&
        'put' in value &&
        typeof value.put === 'function',
    )
}
