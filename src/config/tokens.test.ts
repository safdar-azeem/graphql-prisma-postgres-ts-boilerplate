import { describe, expect, it } from 'vitest'
import { UserType } from '@/generated/prisma/client'
import { generateTokenPair, verifyAccessToken, verifyRefreshToken } from './tokens'

describe('token routing ownership', () => {
  it('carries the owner routing key for a managed user in both tokens', () => {
    const tokens = generateTokenPair({
      id: 'employee-1',
      ownerId: 'owner-1',
      email: 'employee@example.com',
      userType: UserType.EMPLOYEE,
    })

    expect(verifyAccessToken(tokens.accessToken)).toEqual(
      expect.objectContaining({ _id: 'employee-1', routingKey: 'owner-1' })
    )
    expect(verifyRefreshToken(tokens.refreshToken)).toEqual(
      expect.objectContaining({ sub: 'employee-1', routingKey: 'owner-1' })
    )
  })
})
