import { describe, it, expect } from 'vitest'
import {
  parseAllowedOrigins,
  isOriginAllowed,
} from '../services/storage/src/middleware/cors'

describe('storage CORS origin matching', () => {
  const allowed = parseAllowedOrigins('https://app.example.com,https://admin.example.com')

  it('allows an exact listed origin', () => {
    expect(isOriginAllowed('https://app.example.com', allowed, { development: false })).toBe(true)
  })

  it('rejects an unlisted origin', () => {
    expect(isOriginAllowed('https://evil.example.com', allowed, { development: false })).toBe(
      false
    )
  })

  it('rejects attacker suffix domains that share a prefix', () => {
    expect(
      isOriginAllowed('https://app.example.com.attacker.com', allowed, { development: false })
    ).toBe(false)
  })

  it('rejects similar-looking domains', () => {
    expect(isOriginAllowed('https://app.example.com.evil', allowed, { development: false })).toBe(
      false
    )
    expect(isOriginAllowed('https://app-example.com', allowed, { development: false })).toBe(false)
    expect(isOriginAllowed('https://app.example.co', allowed, { development: false })).toBe(false)
  })
})
