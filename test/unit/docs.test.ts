import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

import { docsCacheHeaders } from '../../docs/server/utils/cache-policy'
import {
    fetchContentSha,
    isAuthorizedDocsRevalidation,
    isCommitSha,
    isFreshRevision,
    isRevisionState,
    revalidateContentRevision,
} from '../../docs/server/utils/content-revision'
import { repositoryRoot } from '../utils/fixture'

const contentDirectory = resolve(repositoryRoot, 'docs/content')

const routeFor = (path: string) => {
    const parts = path.replaceAll('\\', '/').replace(/\.md$/u, '').split('/')
    const route = parts.map((part) => part.replace(/^\d+\./u, '')).filter((part) => part !== 'index')
    return `/${route.join('/')}`
}

test('documentation pages and internal links stay complete', async () => {
    const files = (await readdir(contentDirectory, { recursive: true })).filter((path) => path.endsWith('.md'))
    expect(files).toHaveLength(13)

    const routes = new Set(files.map(routeFor))
    const pages = await Promise.all(files.map((path) => readFile(resolve(contentDirectory, path), 'utf8')))
    const links = pages.flatMap((page) =>
        [...page.matchAll(/(?:\]\(|\bto:\s*|\bto=")(\/[a-z0-9][^\s)"#?]*)/giu)].map((match) => match[1]!),
    )
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(routes, link).toContain(link)

    const content = pages.join('\n')
    for (const example of [
        "from 'files-sdk/versioning'",
        'useServerFiles()',
        "useServerFiles('archive')",
        '$development',
        'useFiles',
        'useList',
        'nuxt-files-sdk/nitro',
        'write: false',
    ]) {
        expect(content, example).toContain(example)
    }
    expect(content).not.toContain('nuxt-files-sdk/plugins')
})

test('documentation dependencies and local storage stay isolated from the public package', async () => {
    const rootPackage = await readFile(resolve(repositoryRoot, 'package.json'), 'utf8')
    const docsPackage = await readFile(resolve(repositoryRoot, 'docs/package.json'), 'utf8')
    const publicPackage = await readFile(resolve(repositoryRoot, 'packages/nuxt-files-sdk/package.json'), 'utf8')
    const nuxtConfig = await readFile(resolve(repositoryRoot, 'docs/nuxt.config.ts'), 'utf8')
    const filesConfig = await readFile(resolve(repositoryRoot, 'docs/files.config.ts'), 'utf8')
    const contentRuntime = await readFile(resolve(repositoryRoot, 'docs/server/utils/content.ts'), 'utf8')
    const ogTemplate = await readFile(resolve(repositoryRoot, 'docs/app/components/OgImage/Docs.takumi.vue'), 'utf8')

    for (const dependency of [
        '@comark/nuxt',
        '@nuxt/fonts',
        '@nuxt/image',
        '@nuxt/ui',
        '@nuxtjs/i18n',
        '@nuxtjs/robots',
        '@nuxtjs/sitemap',
        '@takumi-rs/core',
        '@takumi-rs/wasm',
        'nuxt-og-image',
        'rangi',
    ])
        expect(docsPackage).toContain(`"${dependency}"`)
    for (const module of [
        '@nuxt/fonts',
        '@nuxt/image',
        '@nuxtjs/i18n',
        '@nuxtjs/robots',
        '@nuxtjs/sitemap',
        'nuxt-og-image',
    ])
        expect(nuxtConfig).toContain(`'${module}'`)
    const docsManifest = JSON.parse(docsPackage) as { dependencies: Record<string, string> }
    expect(docsManifest.dependencies['comark-content']).toMatch(/^\d+\.\d+\.\d+$/u)
    expect(docsPackage).toContain('"nuxt-files-sdk": "workspace:*"')
    expect(rootPackage).not.toContain('"postinstall"')
    expect(docsPackage).not.toContain('"prepare": "nuxt prepare"')
    expect(docsPackage).not.toContain('"comark-docs"')
    expect(docsPackage).not.toContain('"satori"')
    expect(docsPackage).not.toContain('shiki')
    expect(`${rootPackage}\n${docsPackage}`).not.toContain('@comark/cms')
    expect(publicPackage).not.toContain('comark')
    expect(contentRuntime).toContain("from '@comark/nuxt/plugins/rangi'")
    expect(contentRuntime).not.toContain('shiki')
    expect(ogTemplate).toContain("fontFamily: 'Geist'")
    expect(nuxtConfig).toContain("contentDir: 'docs/content'")
    expect(nuxtConfig).toContain("preset: 'cloudflare-module'")
    expect(nuxtConfig).toContain("locales: [{ code: 'en', language: 'en-US', name: 'English' }]")
    expect(nuxtConfig).toContain("sources: ['/api/__sitemap__/urls']")
    expect(filesConfig).toContain("root: '.data/files-devtools'")
    expect(filesConfig).not.toContain('import { defineFilesConfig }')
    expect(filesConfig).not.toMatch(/^\s*storage:/mu)
    expect(filesConfig).not.toContain('NODE_ENV')
})

test('GitHub content revision checks are bounded and validated', async () => {
    const sha = 'a'.repeat(40)
    const state = { activeSha: sha, checkedAt: 10_000 }
    expect(isRevisionState(state)).toBe(true)
    expect(isRevisionState({ ...state, activeSha: '../main' })).toBe(false)
    expect(isFreshRevision(state, 69_999, 60_000)).toBe(true)
    expect(isFreshRevision(state, 70_000, 60_000)).toBe(false)

    let requestUrl = ''
    let authorization = ''
    const fetcher: typeof fetch = async (input, init) => {
        requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        authorization = new Headers(init?.headers).get('authorization') ?? ''
        return new Response(JSON.stringify([{ sha }]), { status: 200 })
    }
    await expect(
        fetchContentSha({
            repository: 'liria24/nuxt-files-sdk',
            branch: 'main',
            contentDir: 'docs/content',
            token: 'test-token',
            fetch: fetcher,
        }),
    ).resolves.toBe(sha)
    expect(requestUrl).toContain('/repos/liria24/nuxt-files-sdk/commits')
    expect(requestUrl).toContain('path=docs%2Fcontent')
    expect(authorization).toBe('Bearer test-token')

    await expect(
        fetchContentSha({
            repository: 'liria24/nuxt-files-sdk',
            branch: 'main',
            contentDir: 'docs/content',
            fetch: async () => new Response('rate limited', { status: 403 }),
        }),
    ).rejects.toThrow('403')
})

test('docs cache headers separate homepage, content, API, errors, and static assets', () => {
    const home = docsCacheHeaders('/', 200, 'text/html')
    expect(home).toEqual({
        'cache-control': 'public, max-age=0',
        'cloudflare-cdn-cache-control': 'public, max-age=86400',
        vary: 'Cookie',
    })
    for (const path of ['/getting-started/installation', '/raw/index.md', '/llms.txt', '/sitemap.xml']) {
        expect(docsCacheHeaders(path, 200, path.endsWith('.md') ? 'text/markdown' : 'text/html')).toEqual({
            'cache-control': 'public, max-age=0',
            'cloudflare-cdn-cache-control': 'public, max-age=60',
            'cache-tag': 'nuxt-files-sdk-docs',
        })
    }
    const noStore = { 'cache-control': 'no-store', 'cloudflare-cdn-cache-control': 'no-store' }
    for (const [path, status] of [
        ['/api/content/index', 200],
        ['/api/internal/revalidate-docs', 200],
        ['/', 404],
        ['/raw/index.md', 503],
    ] as const) {
        expect(docsCacheHeaders(path, status, 'text/html')).toEqual(noStore)
    }
    expect(docsCacheHeaders('/other.json', 200, 'application/json')).toEqual(noStore)
    expect(docsCacheHeaders('/', 200, 'text/html', true)).toEqual(noStore)
    expect(docsCacheHeaders('/_nuxt/app.js', 200, 'text/javascript')).toBeUndefined()
})

test('docs revalidation authenticates and validates before saving and purging', async () => {
    const sha = 'a'.repeat(40)
    expect(isAuthorizedDocsRevalidation(`Bearer secret`, 'secret')).toBe(true)
    expect(isAuthorizedDocsRevalidation('Bearer wrong', 'secret')).toBe(false)
    expect(isAuthorizedDocsRevalidation(undefined, 'secret')).toBe(false)
    expect(isAuthorizedDocsRevalidation('Bearer secret', undefined)).toBe(false)
    expect(isCommitSha(sha)).toBe(true)
    expect(isCommitSha('../main')).toBe(false)

    const order: string[] = []
    const steps = {
        latest: async () => {
            order.push('latest')
            return sha
        },
        validate: async () => {
            order.push('validate')
        },
        save: async () => {
            order.push('save')
        },
        purge: async () => {
            order.push('purge')
            return { success: true }
        },
    }
    expect(await revalidateContentRevision(sha, steps)).toBe(true)
    expect(order).toEqual(['latest', 'validate', 'save', 'purge'])

    order.length = 0
    expect(await revalidateContentRevision('b'.repeat(40), steps)).toBe(false)
    expect(order).toEqual(['latest'])

    for (const failedStep of ['validate', 'save', 'purge'] as const) {
        order.length = 0
        const failing = {
            ...steps,
            [failedStep]: async () => {
                order.push(failedStep)
                throw new Error(`${failedStep} failed`)
            },
        }
        await expect(revalidateContentRevision(sha, failing)).rejects.toThrow(`${failedStep} failed`)
        expect(order).toEqual(
            failedStep === 'validate'
                ? ['latest', 'validate']
                : failedStep === 'save'
                  ? ['latest', 'validate', 'save']
                  : ['latest', 'validate', 'save', 'purge'],
        )
    }
    await expect(revalidateContentRevision(sha, { ...steps, purge: async () => ({ success: false }) })).rejects.toThrow(
        'purge failed',
    )
})
