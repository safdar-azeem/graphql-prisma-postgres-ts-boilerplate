import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('API CORS origin matching', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('allows exact origins and rejects attacker suffix / similar domains', async () => {
    vi.doMock('@/constants', () => ({
      IS_DEVELOPMENT: false,
      FRONTEND_URL: 'https://app.example.com',
      CORS_ALLOWED_ORIGINS: '',
    }))

    const { isOriginAllowed } = await import('@/middleware/cors.middleware')
    const allowed = ['https://app.example.com', 'https://myapp.com', 'https://app.myapp.com']

    expect(isOriginAllowed('https://app.example.com', allowed, { development: false })).toBe(true)
    expect(isOriginAllowed('https://evil.example.com', allowed, { development: false })).toBe(
      false
    )
    expect(
      isOriginAllowed('https://app.example.com.attacker.com', allowed, { development: false })
    ).toBe(false)
    expect(isOriginAllowed('https://app.example.co', allowed, { development: false })).toBe(false)
  })
})
