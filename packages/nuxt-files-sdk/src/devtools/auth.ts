export interface FilesDevtoolsToken {
    token: string
    expiresAt: number
}

export const FILES_DEVTOOLS_TOKEN_TTL = 60_000

const encoder = new TextEncoder()
const base64Url = (bytes: Uint8Array): string =>
    btoa(String.fromCharCode(...bytes))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '')
const decodeBase64Url = (value: string): ArrayBuffer => {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
    const decoded = atob(`${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`)
    const bytes = new Uint8Array(new ArrayBuffer(decoded.length))
    for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index)
    return bytes.buffer
}
const key = (secret: string): Promise<CryptoKey> =>
    crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])

export const createFilesDevtoolsToken = async (secret: string, now = Date.now()): Promise<FilesDevtoolsToken> => {
    const expiresAt = now + FILES_DEVTOOLS_TOKEN_TTL
    const payload = String(expiresAt)
    const signature = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload))
    return { token: `${payload}.${base64Url(new Uint8Array(signature))}`, expiresAt }
}

export const verifyFilesDevtoolsToken = async (token: string, secret: string, now = Date.now()): Promise<boolean> => {
    const separator = token.indexOf('.')
    if (separator < 1) return false
    const payload = token.slice(0, separator)
    const expiresAt = Number(payload)
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + FILES_DEVTOOLS_TOKEN_TTL) return false
    try {
        return await crypto.subtle.verify(
            'HMAC',
            await key(secret),
            decodeBase64Url(token.slice(separator + 1)),
            encoder.encode(payload),
        )
    } catch {
        return false
    }
}

type RequestHeaders =
    | Headers
    | {
          authorization?: string | string[] | undefined
          get?: ((name: string) => string | null | undefined) | undefined
      }

const authorizationHeader = (headers: RequestHeaders): string | undefined => {
    if (headers instanceof Headers) return headers.get('authorization') ?? undefined
    const value = headers.get?.('authorization') ?? headers.authorization
    return Array.isArray(value) ? value[0] : value
}

export const authorizeFilesDevtoolsRequest = async (
    request: { headers: RequestHeaders },
    secret: string,
): Promise<boolean> => {
    const authorization = authorizationHeader(request.headers)
    return authorization?.startsWith('Bearer ')
        ? verifyFilesDevtoolsToken(authorization.slice('Bearer '.length), secret)
        : false
}
