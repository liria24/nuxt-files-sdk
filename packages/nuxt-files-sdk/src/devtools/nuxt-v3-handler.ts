import { readFile } from 'node:fs/promises'

const html = readFile(new URL('./client/index.html', import.meta.url), 'utf8')

export default async (event: { path: string; node: { res: { setHeader(name: string, value: string): void } } }) => {
    if (event.path !== '/' && event.path !== '/index.html') return undefined
    event.node.res.setHeader('content-type', 'text/html; charset=utf-8')
    return html
}
