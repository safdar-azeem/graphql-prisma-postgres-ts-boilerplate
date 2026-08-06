import { describe, it, expect } from 'vitest'
import { sanitizeLogText } from '@/config/logger'

describe('sanitizeLogText', () => {
  it('redacts secret and token patterns', () => {
    expect(sanitizeLogText('boom secret=abc token=xyz')).not.toContain('secret=abc')
    expect(sanitizeLogText('boom secret=abc token=xyz')).not.toContain('token=xyz')
    expect(sanitizeLogText('Authorization: Bearer abc.def')).not.toMatch(/Bearer abc/)
  })

  it('redacts sensitive query parameters', () => {
    const out = sanitizeLogText('http://host/path?token=abc&file=1')
    expect(out).not.toContain('token=abc')
  })
})
