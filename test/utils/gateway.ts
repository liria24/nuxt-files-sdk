import { expect } from 'vitest'

export const postGateway = (url: string, body: object, user?: string) =>
    fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: { 'content-type': 'application/json', ...(user && { 'x-files-user': user }) },
        body: JSON.stringify(body),
    })

/** Check the storage selected by a generated route, independently of its framework launcher. */
export const assertGatewayListing = async (url: string, keys: string[], user?: string): Promise<void> => {
    const response = await postGateway(url, { op: 'list' }, user)
    expect(response.status).toBe(200)
    const result = (await response.json()) as { items: { key: string }[] }
    expect(result.items.map((item) => item.key)).toEqual(keys)
}
