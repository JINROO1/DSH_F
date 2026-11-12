import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
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
const tokenMap: Record<string, string> = {
  '--dsw-alias-bg-base': '--bg',
  '--dsw-alias-bg-layer-1': '--surface',
  '--dsw-alias-bg-layer-2': '--surface-2',
  '--dsw-alias-bg-layer-3': '--surface-3',
  '--dsw-alias-bg-module-platform': '--surface-2',
  '--dsw-alias-bg-overlay': '--surface',
  '--dsw-alias-border-l1': '--border',
  '--dsw-alias-border-l2': '--border-strong',
  '--dsw-alias-border-l3': '--border-strong',
  '--dsw-alias-border-l4': '--border-strong',
  '--dsw-alias-border-selected': '--accent',
  '--dsw-alias-label-primary': '--text',
  '--dsw-alias-label-secondary': '--muted',
  '--dsw-alias-label-tertiary': '--dim',
  '--dsw-alias-label-caption': '--dim',
  '--dsw-alias-state-business-primary': '--accent',
  '--dsw-alias-state-business-tertiary': '--accent-soft',
  '--dsw-alias-link': '--accent',
  '--dsw-alias-button-primary-fill': '--accent-strong',
  '--dsw-alias-button-primary-hover': '--accent-hover',
  '--dsw-alias-label-on-color': '--on-accent',
  '--dsw-specific-sidebar-fill': '--sidebar',
  '--dsw-specific-sidebar-nav-item-active': '--accent-soft',
  '--dsw-specific-tip': '--surface-2',
}

describe('paridad de tema shell/agente', () => {
  it('reutiliza exactamente los tokens de la shell en claro y oscuro', async () => {
    const shell = await readFile(join(root, 'src/renderer/styles.css'), 'utf8')
    const harness = await readFile(join(root, 'src/renderer/harness-theme.css'), 'utf8')
    const shellDark = declarations(block(shell, ':root'))
    const shellLight = declarations(block(shell, ':root[data-theme=light]'))
    const agentLight = declarations(block(harness, 'html body'))
    const agentDark = declarations(block(harness, 'html body[data-ds-dark-theme]'))
    for (const [alias, variable] of Object.entries(tokenMap)) {
      expect(agentLight.get(alias), `${alias} light`).toBe(shellLight.get(variable))
      expect(agentDark.get(alias), `${alias} dark`).toBe(shellDark.get(variable))
    }
    expect(agentLight.get('--dsh-font-family-text')).toBe(shellDark.get('font-family'))
    expect(agentLight.get('color-scheme')).toBe('light')
    expect(agentDark.get('color-scheme')).toBe('dark')
    expect(harness).toContain("url('/__dshf/fonts/inter-latin-wght-normal.woff2')")
    expect(harness).toContain("url('/__dshf/fonts/inter-latin-ext-wght-normal.woff2')")
  })

  it('la preferencia de sistema usa exactamente la misma paleta clara que el selector explícito', async () => {
    const shell = await readFile(join(root, 'src/renderer/styles.css'), 'utf8')
    const explicit = declarations(block(shell, ':root[data-theme=light]'))
    const system = declarations(block(shell, ':root:not([data-theme=dark])'))
    expect(system).toEqual(explicit)
  })
})
