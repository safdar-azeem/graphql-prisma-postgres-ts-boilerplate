import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import type { Request } from 'express'

process.env.STORAGE_SERVICE_TOKEN_SECRET =
  process.env.STORAGE_SERVICE_TOKEN_SECRET || 'test-storage-secret-at-least-32-chars!'
process.env.STORAGE_SERVICE_TOKEN_ISSUER = 'boilerplate-storage'
process.env.STORAGE_SERVICE_TOKEN_AUDIENCE = 'boilerplate-storage-service'

const SECRET = process.env.STORAGE_SERVICE_TOKEN_SECRET!
const ISSUER = 'boilerplate-storage'
const AUDIENCE = 'boilerplate-storage-service'

let extractServiceBearerToken: typeof import('../services/storage/src/middleware/auth.middleware').extractServiceBearerToken
let verifyStorageServiceToken: typeof import('../services/storage/src/middleware/auth.middleware').verifyStorageServiceToken
let verifyFileViewToken: typeof import('../services/storage/src/middleware/auth.middleware').verifyFileViewToken

beforeAll(async () => {
  const auth = await import('../services/storage/src/middleware/auth.middleware.ts')
  extractServiceBearerToken = auth.extractServiceBearerToken
  verifyStorageServiceToken = auth.verifyStorageServiceToken
  verifyFileViewToken = auth.verifyFileViewToken
})

function signService(payload: Record<string, unknown> = {}) {
  return jwt.sign(
    { _id: 'user-1', email: 'a@b.com', tokenType: 'storage-service', ...payload },
    SECRET,
    { algorithm: 'HS256', issuer: ISSUER, audience: AUDIENCE, expiresIn: 60 }
  )
}

function signFileView() {
  return jwt.sign(
    { fileId: 'file-1', ownerId: 'user-1', tokenType: 'file-view' },
    SECRET,
    { algorithm: 'HS256', issuer: ISSUER, audience: AUDIENCE, expiresIn: 60 }
  )
}

describe('storage service auth', () => {
  it('accepts Authorization Bearer storage-service tokens', () => {
    const token = signService()
    const req = { headers: { authorization: `Bearer ${token}` } } as Request
    expect(extractServiceBearerToken(req)).toBe(token)
    expect(verifyStorageServiceToken(token)?.id).toBe('user-1')
  })

  it('does not extract tokens from query strings', () => {
    const token = signService()
    const req = { headers: {}, query: { token } } as unknown as Request
    expect(extractServiceBearerToken(req)).toBeNull()
  })

  it('does not extract tokens from cookies', () => {
    const token = signService()
    const req = {
      headers: {},
      cookies: { token, accessToken: token, auth_token: token },
    } as unknown as Request
    expect(extractServiceBearerToken(req)).toBeNull()
  })

  it('rejects normal user access tokens', () => {
    const access = jwt.sign(
      { _id: 'user-1', tokenType: 'access' },
      process.env.ACCESS_TOKEN_SECRET || 'test-access-secret-at-least-32-chars!!',
      { algorithm: 'HS256', issuer: 'boilerplate-api', audience: 'boilerplate-clients' }
    )
    expect(verifyStorageServiceToken(access)).toBeNull()
  })

  it('rejects storage-service tokens used as file-view tokens', () => {
    expect(verifyFileViewToken(signService())).toBeNull()
  })

  it('accepts purpose-limited file-view tokens', () => {
    expect(verifyFileViewToken(signFileView())).toEqual({
      fileId: 'file-1',
      ownerId: 'user-1',
    })
  })
})

describe('validateStorageSecrets (real implementation)', () => {
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
    const mod = await import('../services/storage/src/constants/index.ts')
    return mod.validateStorageSecrets
  }

  it('rejects a missing dedicated secret', async () => {
    const validate = await loadValidator({
      STORAGE_SERVICE_TOKEN_SECRET: undefined,
      JWT_SECRET: undefined,
    })
    expect(() => validate()).toThrow(/STORAGE_SERVICE_TOKEN_SECRET is required/)
  })

  it('rejects legacy JWT_SECRET fallback', async () => {
    const validate = await loadValidator({
      STORAGE_SERVICE_TOKEN_SECRET: undefined,
      JWT_SECRET: 'legacy-shared-secret-at-least-32-chars!',
    })
    expect(() => validate()).toThrow(/Legacy JWT_SECRET fallback is not supported/)
  })

  it('rejects a secret shorter than 32 characters', async () => {
    const validate = await loadValidator({
      STORAGE_SERVICE_TOKEN_SECRET: 'too-short',
      JWT_SECRET: undefined,
    })
    expect(() => validate()).toThrow(/at least 32 characters/)
  })

  it('rejects the default example secret', async () => {
    const validate = await loadValidator({
      STORAGE_SERVICE_TOKEN_SECRET: 'change-this-to-a-secure-secret-in-production',
      JWT_SECRET: undefined,
    })
    expect(() => validate()).toThrow(/changed from the default/)
  })

  it('accepts a valid dedicated secret', async () => {
    const validate = await loadValidator({
      STORAGE_SERVICE_TOKEN_SECRET: 'valid-storage-secret-at-least-32-chars!!',
      JWT_SECRET: undefined,
    })
    expect(() => validate()).not.toThrow()
  })
})
