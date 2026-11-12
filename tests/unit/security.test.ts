import { describe, expect, it } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { allowedNavigation, allowedPermission, parseLaunchUrl, readCookie, secretMatches, trustedRequest, validAppSender, validateExternalUrl } from '../../src/main/security.js'

const req = (headers: Record<string, string | undefined>, method = 'GET'): IncomingMessage => ({ headers, method } as unknown as IncomingMessage)
const authority = '127.0.0.1:4100'
const origins = ['dshf://app']

describe('secret comparison and cookies', () => {
  it('compares equal non-empty secrets and rejects length/empty mismatches', () => {
    expect(secretMatches('abc', 'abc')).toBe(true)
    expect(secretMatches('abc', 'abd')).toBe(false)
    expect(secretMatches('abc', 'ab')).toBe(false)
    expect(secretMatches('', '')).toBe(false)
  })
  it('parses only the named cookie within bounded headers', () => {
    expect(readCookie('a=1; dshf_bridge=secret; b=2', 'dshf_bridge')).toBe('secret')
    expect(readCookie('dshf_bridge=secret', 'dshf_bridge')).toBe('secret')
    expect(readCookie('other=1', 'dshf_bridge')).toBeUndefined()
    expect(readCookie(undefined, 'x')).toBeUndefined()
    expect(readCookie('x'.repeat(9000), 'x')).toBeUndefined()
    expect(readCookie('=orphan; x=1', 'x')).toBe('1')
  })
})

describe('request fence', () => {
  it('accepts same-origin session requests from the shell', () => {
    expect(trustedRequest(req({ host: authority, origin: 'dshf://app', 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'iframe' }), authority, origins, true)).toBe(true)
    expect(trustedRequest(req({ host: authority, origin: `http://${authority}`, 'sec-fetch-site': 'same-origin' }), authority, origins, true)).toBe(true)
    expect(trustedRequest(req({ host: authority, 'sec-fetch-site': 'none' }), authority, origins, true)).toBe(true)
  })
  it('rejects foreign hosts, origins, sites, mutations without origin and missing sessions', () => {
    expect(trustedRequest(req({ host: 'evil.example' }), authority, origins, true)).toBe(false)
    expect(trustedRequest(req({ host: authority, origin: 'https://evil.example' }), authority, origins, true)).toBe(false)
    expect(trustedRequest(req({ host: authority, 'sec-fetch-site': 'same-site' }), authority, origins, true)).toBe(false)
    expect(trustedRequest(req({ host: authority, 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'script' }), authority, origins, true)).toBe(false)
    expect(trustedRequest(req({ host: authority }, 'POST'), authority, origins, true)).toBe(false)
    expect(trustedRequest(req({ host: authority, origin: `http://${authority}` }, 'POST'), authority, origins, false)).toBe(false)
  })
  it('allows cross-site iframe navigation only for GET/HEAD with a session', () => {
    const headers = { host: authority, 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'iframe' }
    expect(trustedRequest(req(headers), authority, origins, true)).toBe(true)
    expect(trustedRequest(req(headers, 'HEAD'), authority, origins, true)).toBe(true)
    expect(trustedRequest(req(headers, 'POST'), authority, origins, true)).toBe(false)
    expect(trustedRequest(req(headers), authority, origins, false)).toBe(false)
  })
})

describe('launch URL parsing', () => {
  const token = 'a'.repeat(43)
  it('extracts the official loopback launch line', () => {
    expect(parseLaunchUrl(`ruido\ndsh web: http://127.0.0.1:3080/?token=${token}\n`)?.port).toBe('3080')
  })
  it('rejects malformed, remote, credentialed or hashed URLs', () => {
    for (const value of [
      `dsh web: http://127.0.0.1:3080/?token=${'a'.repeat(42)}`,
      `dsh web: http://evil.example/?token=${token}`,
      `dsh web: http://user:pass@127.0.0.1:3080/?token=${token}`,
      `dsh web: http://127.0.0.1:3080/path?token=${token}`,
      `dsh web: http://127.0.0.1:3080/?token=${token}#frag`,
      `dsh web: http://127.0.0.1:0/?token=${token}`,
      'sin URL',
    ]) expect(parseLaunchUrl(value)).toBeUndefined()
  })
})

describe('Electron origin helpers', () => {
  it('pins the privileged sender to dshf://app', () => {
    expect(validAppSender('dshf://app/index.html', 'dshf://app')).toBe(true)
    expect(validAppSender('dshf://evil/index.html', 'dshf://app')).toBe(false)
    expect(validAppSender('https://app/index.html', 'dshf://app')).toBe(false)
    expect(validAppSender('no es una URL', 'dshf://app')).toBe(false)
  })
  it('allows clipboard only for shell and current bridge', () => {
    expect(allowedPermission('clipboard-read', 'dshf://app/index.html', 'http://127.0.0.1:1')).toBe(true)
    expect(allowedPermission('clipboard-sanitized-write', 'http://127.0.0.1:1/x', 'http://127.0.0.1:1')).toBe(true)
    expect(allowedPermission('clipboard-read', 'https://evil.example', 'http://127.0.0.1:1')).toBe(false)
    expect(allowedPermission('media', 'dshf://app/index.html', undefined)).toBe(false)
    expect(allowedPermission('clipboard-read', 'bad', undefined)).toBe(false)
    expect(allowedPermission('clipboard-read', 'http://127.0.0.1:1/x', undefined)).toBe(false)
  })
  it('contains main and subframe navigation', () => {
    expect(allowedNavigation('dshf://app/index.html', true, undefined)).toBe(true)
    expect(allowedNavigation('https://evil.example', true, 'http://127.0.0.1:1')).toBe(false)
    expect(allowedNavigation('http://127.0.0.1:1/x', false, 'http://127.0.0.1:1')).toBe(true)
    expect(allowedNavigation('http://127.0.0.1:2/x', false, 'http://127.0.0.1:1')).toBe(false)
    expect(allowedNavigation('http://127.0.0.1:1/x', false, undefined)).toBe(false)
    expect(allowedNavigation('bad', false, 'http://127.0.0.1:1')).toBe(false)
  })
  it('only opens HTTPS links without credentials', () => {
    expect(validateExternalUrl('https://github.com/x').hostname).toBe('github.com')
    expect(() => validateExternalUrl('http://github.com')).toThrow()
    expect(() => validateExternalUrl('https://user:pass@github.com')).toThrow()
    expect(() => validateExternalUrl('file:///etc/passwd')).toThrow()
  })
})
