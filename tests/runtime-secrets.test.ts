import { describe, it, expect, vi, afterEach } from 'vitest'

describe('validateRuntimeSecrets', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  async function loadValidator(env: Record<string, string | undefined>) {
    vi.resetModules()
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    return import('@/constants')
  }

  it('rejects equal access and refresh secrets in production', async () => {
    const { validateRuntimeSecrets } = await loadValidator({
      NODE_ENV: 'production',
      ACCESS_TOKEN_SECRET: 'same-secret-value-at-least-32-chars!!',
      REFRESH_TOKEN_SECRET: 'same-secret-value-at-least-32-chars!!',
      STORAGE_SERVICE_TOKEN_SECRET: 'different-storage-secret-32-chars!!!',
      MFA_ENCRYPTION_KEY: '12345678901234567890123456789012',
      JWT_SECRET: undefined,
    })
    expect(() => validateRuntimeSecrets()).toThrow(/must be different/i)
  })

  it('rejects legacy JWT_SECRET fallback in production', async () => {
    const { validateRuntimeSecrets } = await loadValidator({
      NODE_ENV: 'production',
      ACCESS_TOKEN_SECRET: undefined,
      REFRESH_TOKEN_SECRET: undefined,
      JWT_SECRET: 'legacy-shared-secret-at-least-32-chars!',
      STORAGE_SERVICE_TOKEN_SECRET: 'different-storage-secret-32-chars!!!',
      MFA_ENCRYPTION_KEY: '12345678901234567890123456789012',
    })
    expect(() => validateRuntimeSecrets()).toThrow(/Legacy JWT_SECRET/i)
  })

  it('rejects storage secret equal to access secret', async () => {
    const { validateRuntimeSecrets } = await loadValidator({
      NODE_ENV: 'development',
      ACCESS_TOKEN_SECRET: 'access-secret-value-at-least-32-chars!',
      REFRESH_TOKEN_SECRET: 'refresh-secret-value-at-least-32-chars',
      STORAGE_SERVICE_TOKEN_SECRET: 'access-secret-value-at-least-32-chars!',
      MFA_ENCRYPTION_KEY: '12345678901234567890123456789012',
      JWT_SECRET: undefined,
    })
    expect(() => validateRuntimeSecrets()).toThrow(/STORAGE_SERVICE_TOKEN_SECRET must be distinct/i)
  })
})
