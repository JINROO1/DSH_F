import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// WCAG 2.x relative luminance / contrast ratio. We intentionally use exact
// sRGB values (no rounding to two decimals) so a 4.499 pair cannot pass as 4.50.
type RGBA = readonly [number, number, number, number]
const root = fileURLToPath(new URL('../..', import.meta.url))
const MIN_TEXT = 4.5

function declarations(block: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const part of block.split(';')) {
    const index = part.indexOf(':')
    if (index < 0) continue
    map.set(part.slice(0, index).trim(), part.slice(index + 1).replace(/\s+/gu, '').trim())
  }
  return map
}
function block(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const match = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, 'u').exec(css)
  if (!match?.[1]) throw new Error(`No existe el bloque ${selector}`)
  return match[1]
}
function color(value: string): RGBA {
  const input = value.trim()
  if (input === 'transparent') return [0, 0, 0, 0]
  if (input === 'white') return [255, 255, 255, 1]
  if (input.startsWith('#')) {
    let hex = input.slice(1)
    if (hex.length === 3) hex = [...hex].map(character => character + character).join('')
    if (hex.length !== 6) throw new Error(`Color hexadecimal no soportado: ${value}`)
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 1]
  }
  const match = /^rgba?\(([^)]+)\)$/u.exec(input)
  if (!match?.[1]) throw new Error(`Color no soportado: ${value}`)
  const parts = match[1].split(',').map(Number)
  if (parts.length < 3 || parts.length > 4 || parts.some(part => !Number.isFinite(part))) throw new Error(`Color inválido: ${value}`)
  return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1]
}
function resolve(value: string, tokens: Map<string, string>): string {
  const match = /^var\((--[^)]+)\)$/u.exec(value)
  if (!match?.[1]) return value
  const resolved = tokens.get(match[1])
  if (!resolved) throw new Error(`Token desconocido: ${match[1]}`)
  return resolve(resolved, tokens)
}
function composite(foreground: RGBA, background: RGBA): RGBA {
  const alpha = foreground[3]
  return [
    foreground[0] * alpha + background[0] * (1 - alpha),
    foreground[1] * alpha + background[1] * (1 - alpha),
    foreground[2] * alpha + background[2] * (1 - alpha),
    1,
  ]
}
function luminance(value: RGBA): number {
  const channels = value.slice(0, 3).map(channel => {
    const normalized = channel / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}
function contrast(foreground: RGBA, background: RGBA): number {
  const a = luminance(foreground), b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
function token(tokens: Map<string, string>, name: string): RGBA {
  const value = tokens.get(name)
  if (!value) throw new Error(`Token desconocido: ${name}`)
  return color(resolve(value, tokens))
}
function splitArguments(value: string): string[] {
  const parts: string[] = []
  let depth = 0, start = 0
  for (let index = 0; index < value.length; index++) {
    const character = value[index]
    if (character === '(') depth++
    if (character === ')') depth--
    if (character === ',' && depth === 0) { parts.push(value.slice(start, index)); start = index + 1 }
  }
  parts.push(value.slice(start))
  return parts.map(part => part.trim())
}
function mix(a: RGBA, b: RGBA, amount: number): RGBA {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount, 1]
}
/** Sample each CSS sRGB gradient segment, including its endpoints. Positions
 * affect where a color appears, not the set of colors between two stops. */
function gradientSamples(css: string, selector: string, tokens: Map<string, string>, backdrop: RGBA): RGBA[] {
  const background = declarations(block(css, selector)).get('background')
  if (!background?.startsWith('linear-gradient(')) throw new Error(`Sin gradiente lineal: ${selector}`)
  const args = splitArguments(background.slice(background.indexOf('(') + 1, background.lastIndexOf(')')))
  const stops = args.slice(1).map(stop => {
    // declarations() strips whitespace, so a stop can be `var(--x)70%`.
    const match = /^(var\(--[^)]+\)|#[0-9a-f]{3,6}|rgba?\([^)]+\)|transparent|white)/iu.exec(stop)
    if (!match?.[1]) throw new Error(`Parada de gradiente no soportada: ${stop}`)
    return composite(color(resolve(match[1], tokens)), backdrop)
  })
  const samples: RGBA[] = []
  for (let index = 0; index < stops.length - 1; index++) {
    for (const amount of [0, 0.25, 0.5, 0.75, 1]) samples.push(mix(stops[index]!, stops[index + 1]!, amount))
  }
  return samples
}

const shellPath = join(root, 'src/renderer/styles.css')
const themes = [
  { name: 'claro', selector: ':root[data-theme=light]' },
  { name: 'oscuro', selector: ':root' },
] as const
const surfaces = ['--bg', '--sidebar', '--surface', '--surface-2', '--surface-3'] as const
const textTokens = ['--text', '--muted', '--dim', '--accent', '--green', '--violet', '--danger'] as const

describe.each(themes)('contraste del tema $name', ({ selector }) => {
  it.each(textTokens)('%s mantiene al menos 4.5:1 sobre todas las superficies', async foreground => {
    const tokens = declarations(block(await readFile(shellPath, 'utf8'), selector))
    for (const background of surfaces) {
      expect(contrast(token(tokens, foreground), token(tokens, background)), `${foreground} sobre ${background}`).toBeGreaterThanOrEqual(MIN_TEXT)
    }
  })

  it('el acento sigue siendo legible sobre selecciones y fondos suaves', async () => {
    const tokens = declarations(block(await readFile(shellPath, 'utf8'), selector))
    const accent = token(tokens, '--accent')
    for (const background of surfaces) {
      const soft = composite(token(tokens, '--accent-soft'), token(tokens, background))
      expect(contrast(accent, soft), `acento sobre selección en ${background}`).toBeGreaterThanOrEqual(MIN_TEXT)
    }
    const danger = token(tokens, '--danger')
    for (const background of surfaces) {
      const soft = composite(token(tokens, '--danger-soft'), token(tokens, background))
      expect(contrast(danger, soft), `error sobre fondo suave en ${background}`).toBeGreaterThanOrEqual(MIN_TEXT)
    }
  })

  it('botones primarios, hover, skip link y marca Fedora conservan texto legible', async () => {
    const css = await readFile(shellPath, 'utf8')
    const tokens = declarations(block(css, selector))
    const onAccent = token(tokens, '--on-accent')
    for (const background of ['--accent-strong', '--accent-hover']) {
      expect(contrast(onAccent, token(tokens, background)), `texto sobre ${background}`).toBeGreaterThanOrEqual(MIN_TEXT)
    }
    const avatar = declarations(block(css, '.avatar'))
    const avatarText = color(resolve(avatar.get('color')!, tokens))
    for (const sample of gradientSamples(css, '.avatar', tokens, token(tokens, '--bg'))) {
      expect(contrast(avatarText, sample), 'avatar').toBeGreaterThanOrEqual(MIN_TEXT)
    }
    const fedora = declarations(block(css, '.fedora-mark'))
    expect(contrast(color(resolve(fedora.get('color')!, tokens)), color(resolve(fedora.get('background')!, tokens))), 'marca Fedora').toBeGreaterThanOrEqual(MIN_TEXT)
  })

  it('los gradientes de portada, tarjetas y tarjeta local no esconden texto tenue', async () => {
    const css = await readFile(shellPath, 'utf8')
    const tokens = declarations(block(css, selector))
    const bg = token(tokens, '--bg')
    // The hero text is itself the clipped gradient, so every sampled text color
    // must contrast with the page background (stricter than the large-text 3:1).
    for (const sample of gradientSamples(css, '.hero h1 span', tokens, bg)) {
      expect(contrast(sample, bg), 'gradiente del titular').toBeGreaterThanOrEqual(MIN_TEXT)
    }
    for (const sample of gradientSamples(css, '.action-card', tokens, bg)) {
      for (const foreground of ['--text', '--muted'] as const) {
        expect(contrast(token(tokens, foreground), sample), `${foreground} en tarjeta`).toBeGreaterThanOrEqual(MIN_TEXT)
      }
    }
    for (const sample of gradientSamples(css, '.local-card', tokens, token(tokens, '--sidebar'))) {
      for (const foreground of ['--text', '--dim'] as const) {
        expect(contrast(token(tokens, foreground), sample), `${foreground} en tarjeta local`).toBeGreaterThanOrEqual(MIN_TEXT)
      }
    }
    // axe cannot resolve the translucent kbd border/background combination.
    const kbd = declarations(block(css, 'kbd'))
    expect(contrast(token(tokens, kbd.get('color')!.replace(/^var\((.*)\)$/u, '$1')), token(tokens, kbd.get('background')!.replace(/^var\((.*)\)$/u, '$1'))), 'teclas kbd').toBeGreaterThanOrEqual(MIN_TEXT)
  })
})
