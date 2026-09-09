import { describe, it, expect, vi } from 'vitest'
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateTokenPair,
} from '../src/config/tokens'
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '../src/constants'

describe('Token Configuration', () => {
  const user = {
    id: 'user-123',
    email: 'test@example.com',
  }
  const routingKey = user.id

  it('should generate a valid access token', () => {
    const token = generateAccessToken({ _id: user.id, routingKey, email: user.email })
    expect(token).toBeDefined()

    const decoded = jwt.verify(token, JWT_SECRET) as any
    expect(decoded._id).toBe(user.id)
    expect(decoded.email).toBe(user.email)
    expect(decoded.routingKey).toBe(routingKey)
  })

  it('should generate a valid refresh token with JTI', () => {
    const { token, jti } = generateRefreshToken(user.id, routingKey)
    expect(token).toBeDefined()
    expect(jti).toBeDefined()

    const decoded = jwt.verify(token, JWT_SECRET) as any
    expect(decoded.sub).toBe(user.id)
    expect(decoded.jti).toBe(jti)
    expect(decoded.routingKey).toBe(routingKey)
  })

  it('should generate a token pair', () => {
    const pair = generateTokenPair(user)
    expect(pair.accessToken).toBeDefined()
    expect(pair.refreshToken).toBeDefined()
    expect(pair.jti).toBeDefined()
  })

  it('should verify a valid access token', () => {
    const token = generateAccessToken({ _id: user.id, routingKey })
    const payload = verifyAccessToken(token)
    expect(payload).toBeDefined()
    expect(payload?._id).toBe(user.id)
    expect(payload?.routingKey).toBe(routingKey)
  })

  it('should return null for invalid access token', () => {
    const payload = verifyAccessToken('invalid-token')
    expect(payload).toBeNull()
  })

  it('should verify a valid refresh token', () => {
    const { token, jti } = generateRefreshToken(user.id, routingKey)
    const payload = verifyRefreshToken(token)
    expect(payload).toBeDefined()
    expect(payload?.jti).toBe(jti)
    expect(payload?.sub).toBe(user.id)
    expect(payload?.routingKey).toBe(routingKey)
  })
})
