import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

export function secretMatches(actual: string, expected: string): boolean {
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b)
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header || header.length > 8192) return undefined
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return undefined
}

/** Reject DNS rebinding and browser cross-origin calls before touching the owned Host. */
export function trustedRequest(req: IncomingMessage, authority: string, origins: readonly string[], hasSession: boolean): boolean {
  if (req.headers.host !== authority) return false
  const origin = req.headers.origin
  if (origin !== undefined && !origins.includes(origin) && origin !== `http://${authority}`) return false
  const method = req.method ?? 'GET'
  const site = req.headers['sec-fetch-site']
  const dest = req.headers['sec-fetch-dest']
  // The bootstrap redirect loads the owned iframe cross-site from dshf://app.
  // Only navigational document requests may cross that boundary; subresources and
  // mutations still require same-origin. frame-ancestors on the response pins the shell.
  const framedNavigation = site === 'cross-site' && ['GET', 'HEAD'].includes(method) && (dest === 'iframe' || dest === 'document')
  if (site !== undefined && site !== 'same-origin' && site !== 'none' && !framedNavigation) return false
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && origin === undefined) return false
  return hasSession
}

export function parseLaunchUrl(text: string): URL | undefined {
  const match = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]{43})(?=\s|$)/u.exec(text)
  if (!match?.[1]) return undefined
  const url = new URL(match[1])
  if (!['/', ''].includes(url.pathname) || url.hash || url.username || url.password) return undefined
  const port = Number(url.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined
  return url
}

export function validAppSender(url: string, expectedOrigin: string): boolean {
  try {
    const parsed = new URL(url)
    // Node's URL reports "null" as the origin of non-special schemes; Electron
    // registers dshf as standard/secure. Compare the serialized scheme+host instead.
    return parsed.protocol === 'dshf:' && parsed.hostname === 'app' && !parsed.port && !parsed.username && !parsed.password && `${parsed.protocol}//${parsed.hostname}` === expectedOrigin
  } catch { return false }
}

/** Only the shell and the currently owned bridge may use clipboard APIs. */
export function allowedPermission(permission: string, requestingUrl: string, bridgeOrigin: string | undefined): boolean {
  if (!['clipboard-read', 'clipboard-sanitized-write'].includes(permission)) return false
  try {
    const origin = new URL(requestingUrl).origin
    return validAppSender(requestingUrl, 'dshf://app') || (bridgeOrigin !== undefined && origin === bridgeOrigin)
  } catch { return false }
}

/** Keep the privileged top frame on its custom scheme; contain Harness in its loopback frame. */
export function allowedNavigation(url: string, isMainFrame: boolean, bridgeOrigin: string | undefined): boolean {
  try {
    const parsed = new URL(url)
    if (isMainFrame) return validAppSender(url, 'dshf://app')
    return bridgeOrigin !== undefined && parsed.origin === bridgeOrigin && parsed.protocol === 'http:'
  } catch { return false }
}

export function validateExternalUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Solo se permiten enlaces HTTPS sin credenciales')
  return url
}
