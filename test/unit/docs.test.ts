import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

import { docsCacheHeaders } from '../../docs/server/utils/cache-policy'
import {
    fetchContentSha,
    isFreshRevision,
    isRevisionState,
    selectDocsContent,
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

test('stale docs serve the active revision while a refresh runs in the background', async () => {
    const sha = 'a'.repeat(40)
    const calls: string[] = []
    const pendingRefresh = new Promise<void>(() => {})
    const options = {
        state: { activeSha: sha, checkedAt: 10_000 },
        now: 70_000,
        refreshInterval: 60_000,
        load: async (activeSha: string) => {
            calls.push(`load:${activeSha}`)
            return 'active'
        },
        refresh: async () => {
            calls.push('refresh')
            return 'next'
        },
        refreshInBackground: () => {
            calls.push('background')
            return pendingRefresh
        },
        onLoadError: () => calls.push('load-error'),
    }

    await expect(selectDocsContent(options)).resolves.toBe('active')
    expect(calls).toEqual([`load:${sha}`, 'background'])

    await expect(selectDocsContent({ ...options, now: 69_999 })).resolves.toBe('active')
    expect(calls.at(-1)).toBe(`load:${sha}`)

    await expect(selectDocsContent({ ...options, state: undefined })).resolves.toBe('next')
    expect(calls.at(-1)).toBe('refresh')

    await expect(
        selectDocsContent({
            ...options,
            load: async () => {
                throw new Error('invalid snapshot')
            },
        }),
    ).resolves.toBe('next')
    expect(calls.slice(-2)).toEqual(['load-error', 'refresh'])
})

test('docs cache headers cache only the homepage and static assets', () => {
    const home = docsCacheHeaders('/', 200)
    expect(home).toEqual({
        'cache-control': 'public, max-age=0',
        'cloudflare-cdn-cache-control': 'public, max-age=86400',
        vary: 'Cookie',
    })
    const noStore = { 'cache-control': 'no-store', 'cloudflare-cdn-cache-control': 'no-store' }
    for (const [path, status] of [
        ['/getting-started/installation', 200],
        ['/raw/index.md', 200],
        ['/llms.txt', 200],
        ['/sitemap.xml', 200],
        ['/_og/d/image', 200],
        ['/_og/r/resolve', 200],
        ['/api/content/index', 200],
        ['/', 404],
        ['/raw/index.md', 503],
    ] as const) {
        expect(docsCacheHeaders(path, status)).toEqual(noStore)
    }
    expect(docsCacheHeaders('/other.json', 200)).toEqual(noStore)
    expect(docsCacheHeaders('/', 200, true)).toEqual(noStore)
    expect(docsCacheHeaders('/_nuxt/app.js', 200)).toBeUndefined()
})
