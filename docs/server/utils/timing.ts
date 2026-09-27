import type { H3Event } from 'h3'

export function recordDocsTiming(event: H3Event, name: string, started: number) {
    const previous = getResponseHeader(event, 'server-timing')
    const metric = `${name};dur=${(performance.now() - started).toFixed(1)}`
    setResponseHeader(event, 'server-timing', previous ? `${String(previous)}, ${metric}` : metric)
}
