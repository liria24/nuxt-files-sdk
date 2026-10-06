import { expect, test } from 'vitest'

import { nitroRequestEvent, nitroResponse } from '../../packages/nuxt-files-sdk/src/integration/nitro-event'

test('standalone Nitro adaptation retains Request, signal, URL, context and portable response changes', async () => {
    const controller = new AbortController()
    const req = new Request('https://files.test/gateway?tenant=a', {
        method: 'POST',
        body: JSON.stringify({ op: 'list' }),
        headers: { 'content-type': 'application/json', 'x-user': 'alice' },
        signal: controller.signal,
    })
    const context = { user: 'alice' }
    const event = nitroRequestEvent(req, context)
    expect(event.req).toBe(req)
    expect(event.context).toBe(context)
    expect(event.url.search).toBe('?tenant=a')
    expect(event.req.headers.get('x-user')).toBe('alice')
    expect(await event.req.json()).toEqual({ op: 'list' })
    event.res.status = 202
    event.res.headers.set('x-policy', 'allowed')
    const response = nitroResponse(Response.json({ ok: true }, { headers: { 'x-sdk': 'preserved' } }), event)
    expect(response.status).toBe(202)
    expect(response.headers.get('x-policy')).toBe('allowed')
    expect(response.headers.get('x-sdk')).toBe('preserved')
    expect(await response.json()).toEqual({ ok: true })
    controller.abort()
    expect(event.req.signal.aborted).toBe(true)
})
