import { describe, expect, it } from 'vitest'
import { messages } from '../../src/renderer/i18n.js'

describe('i18n shell', () => {
  it('mantiene las mismas claves no vacías en español e inglés', () => {
    const es = Object.keys(messages.es).sort()
    const en = Object.keys(messages.en).sort()
    expect(en).toEqual(es)
    for (const key of es) {
      expect(messages.es[key as keyof typeof messages.es].trim(), `es/${key}`).not.toBe('')
      expect(messages.en[key as keyof typeof messages.en].trim(), `en/${key}`).not.toBe('')
    }
  })
})
