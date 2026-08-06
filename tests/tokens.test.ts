import { describe, it, expect } from 'vitest'
import {
  generateAccessToken,
  generateRefreshToken,
  generateStorageServiceToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifyStorageServiceToken,
  generateTokenPair,
  STORAGE_SERVICE_TOKEN_TYPE,
} from '../src/config/tokens'
import jwt from 'jsonwebtoken'
import {
  ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET,
  JWT_ISSUER,
  JWT_AUDIENCE,
  STORAGE_SERVICE_TOKEN_SECRET,
} from '../src/constants'

describe('Token Configuration', () => {
  const user = {
    id: 'user-123',
    email: 'test@example.com',
    workspaceId: 'ws-1',
  }

  it('should generate a valid access token with issuer/audience', () => {
    const token = generateAccessToken({
      _id: user.id,
      email: user.email,
      workspaceId: user.workspaceId,
    })
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET) as any
    expect(decoded._id).toBe(user.id)
    expect(decoded.iss).toBe(JWT_ISSUER)
    expect(decoded.aud).toBe(JWT_AUDIENCE)
    expect(decoded.tokenType).toBe('access')
  })

  it('should generate a valid refresh token signed with refresh secret', () => {
    const { token, jti } = generateRefreshToken(user.id)
    const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET) as any
    expect(decoded.sub).toBe(user.id)
    expect(decoded.jti).toBe(jti)
  })

  it('should reject access tokens verified with the refresh secret', () => {
    const token = generateAccessToken({ _id: user.id, email: user.email })
    expect(() => jwt.verify(token, REFRESH_TOKEN_SECRET)).toThrow()
  })

  it('should generate a token pair', () => {
    const pair = generateTokenPair(user)
    expect(pair.accessToken).toBeDefined()
    expect(pair.refreshToken).toBeDefined()
    expect(pair.jti).toBeDefined()
    expect(verifyAccessToken(pair.accessToken)?._id).toBe(user.id)
    expect(verifyRefreshToken(pair.refreshToken)?.sub).toBe(user.id)
  })

  it('rejects storage-service tokens in verifyAccessToken', () => {
    const storage = generateStorageServiceToken({ _id: user.id, email: user.email })
    expect(verifyAccessToken(storage)).toBeNull()
    expect(verifyStorageServiceToken(storage)?.tokenType).toBe(STORAGE_SERVICE_TOKEN_TYPE)
  })

  it('rejects user access tokens in verifyStorageServiceToken', () => {
    const access = generateAccessToken({ _id: user.id, email: user.email })
    expect(verifyStorageServiceToken(access)).toBeNull()
  })

  it('uses a distinct storage secret from access tokens', () => {
    const storage = generateStorageServiceToken({ _id: user.id })
    expect(() => jwt.verify(storage, ACCESS_TOKEN_SECRET)).toThrow()
    expect(jwt.verify(storage, STORAGE_SERVICE_TOKEN_SECRET)).toBeTruthy()
  })
})
