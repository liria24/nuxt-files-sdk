import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { parseMarkdown } from 'comark'
import { expect, test } from 'vitest'

import { useDemoFiles } from '../../docs/app/composables/useDemoFiles'
import { fetchContentSha, isFreshRevision, isRevisionState } from '../../docs/server/utils/content-revision'
import { repositoryRoot } from '../utils/fixture'

const contentDirectory = resolve(repositoryRoot, 'docs/content')

const routeFor = (path: string) => {
    const parts = path.replaceAll('\\', '/').replace(/\.md$/u, '').split('/')
    const route = parts.map((part) => part.replace(/^\d+\./u, '')).filter((part) => part !== 'index')
    return `/${route.join('/')}`
}

test('component demos keep uploads in their own in-memory client', async () => {
    const files = useDemoFiles()
    await files.upload('uploads/demo.txt', new Blob(['demo'], { type: 'text/plain' }))
    expect(await (await files.download('uploads/demo.txt')).text()).toBe('demo')
    expect(await useDemoFiles().exists('uploads/demo.txt')).toBe(false)
    await expect(files.upload('uploads/invalid.txt', 'unsupported')).rejects.toThrow('File or Blob')
})

test('[UI-005] documentation pages, UI references, and internal links stay complete', async () => {
    const files = (await readdir(contentDirectory, { recursive: true })).filter((path) => path.endsWith('.md'))
    expect(files).toHaveLength(29)

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
        'devStorage',
        'useFiles',
        'useList',
        'nuxt-files-sdk/nitro',
        'write: false',
        '<FilesDropzone',
        '<FilesBrowser',
        '<UApp :locale="locale">',
        'nuxt-files-sdk/ui/locale',
    ]) {
        expect(content, example).toContain(example)
    }
    expect(content).not.toContain('nuxt-files-sdk/plugins')

    const fixture = await readFile(resolve(repositoryRoot, 'test/fixtures/nuxt4-vue/app/app.vue'), 'utf8')
    for (const name of [
        'FilesActions',
        'FilesBrowser',
        'FilesCapabilities',
        'FilesDropzone',
        'FilesList',
        'FilesMultipartUploader',
        'FilesPreview',
        'FilesSearch',
        'FilesShareDialog',
        'FilesTrashBin',
        'FilesUploadProgress',
        'FilesVersionHistory',
    ]) {
        expect(fixture).toContain(`<${name}`)
        expect(content).toContain(`<${name}`)
    }

    const components = [
        ['1.dropzone.md', 'FilesDropzone'],
        ['2.list.md', 'FilesList'],
        ['3.upload-progress.md', 'FilesUploadProgress'],
        ['4.multipart-uploader.md', 'FilesMultipartUploader'],
        ['5.preview.md', 'FilesPreview'],
        ['6.browser.md', 'FilesBrowser'],
        ['7.search.md', 'FilesSearch'],
        ['8.share-dialog.md', 'FilesShareDialog'],
        ['9.actions.md', 'FilesActions'],
        ['10.capabilities.md', 'FilesCapabilities'],
        ['11.version-history.md', 'FilesVersionHistory'],
        ['12.trash-bin.md', 'FilesTrashBin'],
    ] as const
    for (const [pageName, componentName] of components) {
        const page = await readFile(resolve(contentDirectory, '3.ui/5.components', pageName), 'utf8')
        const source = await readFile(
            resolve(repositoryRoot, 'packages/nuxt-files-sdk/src/ui/components', `${componentName}.vue`),
            'utf8',
        )
        const headings = ['## Usage', '## Examples', '## API', '### Props', '### Slots', '### Emits', '## Theme']
        let previous = -1
        for (const heading of headings) {
            const position = page.indexOf(heading)
            expect(position, `${pageName}: ${heading}`).toBeGreaterThan(previous)
            previous = position
        }
        const exampleName = `${componentName.slice('Files'.length)}Example`
        const exampleTag = `${pageName.replace(/^\d+\./u, '').replace(/\.md$/u, '')}-example`
        const document = await parseMarkdown(page)
        expect(document.nodes.some((node) => Array.isArray(node) && node[0] === exampleTag)).toBe(true)
        const example = await readFile(
            resolve(repositoryRoot, 'docs/app/components/prose', `${exampleName}.vue`),
            'utf8',
        )
        expect(example).toContain(`<${componentName}`)
        expect(example).toContain('useDemoFiles()')
        expect(page).toMatch(/\|\s*Prop\s*\|\s*Default\s*\|\s*Type\s*\|/u)
        expect(page).not.toContain('## Events')
        expect(page).toContain('### Class prop')
        expect(page).toContain('### UI prop')
        expect(page).toContain(`${componentName[0]!.toLowerCase()}${componentName.slice(1)}: {`)
        expect(page).not.toMatch(/^\| `(?:color|size|variant)`/mu)
        expect(page).toContain("HTMLAttributes['class']")
        expect(page).not.toMatch(/`Files(?:Color|Size|Ui|Variant)`/u)
        expect(page).toContain('```ts [app.config.ts]')
        expect(page).toContain('slots: {')
        expect(page).not.toContain('defaultVariants: {')

        const propsBlock = source.match(/interface Props \{([\s\S]*?)\n\}/u)?.[1] ?? ''
        for (const match of propsBlock.matchAll(/^\s+(\w+)\??:/gmu)) expect(page).toContain(`| \`${match[1]}\``)
    }
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
