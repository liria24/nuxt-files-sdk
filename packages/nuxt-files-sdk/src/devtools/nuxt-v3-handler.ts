import { readFile } from 'node:fs/promises'

const html = {
    contentType: 'text/html; charset=utf-8',
    content: readFile(new URL('./client/index.html', import.meta.url), 'utf8'),
}
const assets = new Map([
    ['/', html],
    ['/index.html', html],
    [
        '/app.js',
        {
            contentType: 'text/javascript; charset=utf-8',
            content: readFile(new URL('./client/app.js', import.meta.url), 'utf8'),
        },
    ],
    [
        '/style.css',
        {
            contentType: 'text/css; charset=utf-8',
            content: readFile(new URL('./client/style.css', import.meta.url), 'utf8'),
        },
    ],
])

export default async (event: { path: string; node: { res: { setHeader(name: string, value: string): void } } }) => {
    const asset = assets.get(new URL(event.path, 'http://localhost').pathname)
    if (!asset) return undefined
    event.node.res.setHeader('content-type', asset.contentType)
    return asset.content
}
