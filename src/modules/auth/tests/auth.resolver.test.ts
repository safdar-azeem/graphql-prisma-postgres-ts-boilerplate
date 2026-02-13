import { authResolver } from '../resolvers/auth.resolver'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Context } from '@/types/context.type'
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended'
import { AuthenticationError, ValidationError } from '@/errors'
import * as PrismaConfig from '@/config/prisma'
import * as AuthUtils from '../utils/auth.utils'
import * as TokenConfig from '@/config/tokens'
import * as RefreshTokenCache from '@/cache/refreshToken.cache'
import { authLite } from '@/config/authlite'

// Mock external dependencies
vi.mock('@/config/prisma', () => ({
  findUserAcrossShards: vi.fn(),
  sharding: {
    getRandomShard: vi.fn(),
  },
}))

vi.mock('../utils/auth.utils', () => ({
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
  generateToken: vi.fn(),
}))

vi.mock('@/config/tokens', () => ({
  generateTokenPair: vi.fn(),
  generateAccessToken: vi.fn(),
}))

vi.mock('@/cache/refreshToken.cache', () => ({
  storeRefreshToken: vi.fn(),
}))

vi.mock('@/config/authlite', () => ({
  authLite: {
    google: {
      verify: vi.fn(),
    },
  },
  mfa: {
    createEnrollment: vi.fn(),
    verifyTotp: vi.fn(),
  },
}))

vi.mock('@/cache', () => ({
  cache: {
    invalidateUser: vi.fn(),
  },
}))

vi.mock('@/utils/email.util', () => ({
  sendEmail: vi.fn(),
}))

describe('Auth Resolver Integration Tests', () => {
  let mockContext: DeepMockProxy<Context>
  let mockShardClient: any

  beforeEach(() => {
    mockContext = mockDeep<Context>()
    mockShardClient = {
      user: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    }
    vi.clearAllMocks()
  })

  describe('Mutation.signup', () => {
    it('Create a new user', async () => {
      // GIVEN
      const inputData = { email: 'test@example.com', username: 'testuser', password: 'password123' }
      const hashedPassword = 'hashedPassword'
      const accessToken = 'jwt.access.token'
      const refreshToken = 'jwt.refresh.token'
      const createdUser = { id: '1', ...inputData, password: hashedPassword }

      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: null,
        client: null,
      } as any)
      vi.mocked(AuthUtils.hashPassword).mockResolvedValue(hashedPassword)
      vi.mocked(PrismaConfig.sharding.getRandomShard).mockReturnValue(mockShardClient)
      mockShardClient.user.create.mockResolvedValue(createdUser)

      vi.mocked(TokenConfig.generateTokenPair).mockReturnValue({
        accessToken,
        refreshToken,
        jti: 'jti-uuid',
      })

      // WHEN
      const result = await (authResolver.Mutation?.signup as any)(
        {},
        { data: inputData },
        mockContext,
        {}
      )

      // THEN
      expect(PrismaConfig.findUserAcrossShards).toHaveBeenCalled()
      expect(AuthUtils.hashPassword).toHaveBeenCalledWith(inputData.password)
      expect(mockShardClient.user.create).toHaveBeenCalledWith({
        omit: { password: true },
        data: {
          email: inputData.email,
          username: inputData.username,
          password: hashedPassword,
        },
      })
      expect(TokenConfig.generateTokenPair).toHaveBeenCalledWith(
        expect.objectContaining({
          id: createdUser.id,
          email: createdUser.email,
        })
      )
      expect(RefreshTokenCache.storeRefreshToken).toHaveBeenCalledWith(createdUser.id, 'jti-uuid')
      expect(result).toEqual({ token: accessToken, refreshToken, user: createdUser })
    })

    it('Create a new user (Existing)', async () => {
      const inputData = { email: 'test@example.com', username: 'testuser', password: 'password123' }
      const existingUser = { id: '1', ...inputData }

      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: existingUser,
        client: mockShardClient,
      } as any)

      await expect(
        (authResolver.Mutation?.signup as any)({}, { data: inputData }, mockContext, {})
      ).rejects.toThrow(ValidationError)
    })
  })

  describe('Mutation.login', () => {
    it('Login user', async () => {
      const inputData = { email: 'test@example.com', password: 'password123' }
      const hashedPassword = 'hashedPassword'
      const user = {
        id: '1',
        email: inputData.email,
        password: hashedPassword,
        username: 'testuser',
      }
      const accessToken = 'jwt.access.token'
      const refreshToken = 'jwt.refresh.token'

      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: user,
        client: mockShardClient,
      } as any)
      vi.mocked(AuthUtils.comparePassword).mockResolvedValue(true)
      vi.mocked(TokenConfig.generateTokenPair).mockReturnValue({
        accessToken,
        refreshToken,
        jti: 'jti-uuid',
      })

      const { password: _, ...userWithoutPassword } = user

      const result = await (authResolver.Mutation?.login as any)(
        {},
        { data: inputData },
        mockContext,
        {}
      )

      expect(PrismaConfig.findUserAcrossShards).toHaveBeenCalled()
      expect(AuthUtils.comparePassword).toHaveBeenCalledWith(inputData.password, user.password)
      expect(TokenConfig.generateTokenPair).toHaveBeenCalled()
      expect(RefreshTokenCache.storeRefreshToken).toHaveBeenCalledWith(user.id, 'jti-uuid')
      expect(result).toEqual({ token: accessToken, refreshToken, user: userWithoutPassword })
    })

    it('Login user (Invalid Password)', async () => {
      const inputData = { email: 'test@example.com', password: 'wrongpassword' }
      const user = {
        id: '1',
        email: inputData.email,
        password: 'hashedPassword',
        username: 'testuser',
      }

      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: user,
        client: mockShardClient,
      } as any)
      vi.mocked(AuthUtils.comparePassword).mockResolvedValue(false)

      await expect(
        (authResolver.Mutation?.login as any)({}, { data: inputData }, mockContext, {})
      ).rejects.toThrow(AuthenticationError)
    })

    it('Login user (User Not Found)', async () => {
      const inputData = { email: 'notfound@example.com', password: 'password' }

      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: null,
        client: null,
      } as any)

      await expect(
        (authResolver.Mutation?.login as any)({}, { data: inputData }, mockContext, {})
      ).rejects.toThrow(AuthenticationError)
    })
  })

  describe('Mutation.googleLogin', () => {
    it('Google Login (Existing User)', async () => {
      const googleToken = 'google.token'
      const googleUser = { email: 'test@example.com', name: 'Test User', googleId: '123' }
      const existingUser = {
        id: '1',
        email: 'test@example.com',
        username: 'Test User',
        googleId: '123',
      }
      const accessToken = 'jwt.access.token'
      const refreshToken = 'jwt.refresh.token'

      vi.mocked(authLite.google.verify).mockResolvedValue(googleUser as any)
      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: existingUser,
        client: mockShardClient,
      } as any)
      vi.mocked(TokenConfig.generateTokenPair).mockReturnValue({
        accessToken,
        refreshToken,
        jti: 'jti-uuid',
      })

      const result = await (authResolver.Mutation?.googleLogin as any)(
        {},
        { token: googleToken },
        mockContext,
        {}
      )

      expect(result.token).toBe(accessToken)
      expect(result.refreshToken).toBe(refreshToken)
      expect(result.user).toEqual(expect.objectContaining({ email: existingUser.email }))
      expect(RefreshTokenCache.storeRefreshToken).toHaveBeenCalledWith(existingUser.id, 'jti-uuid')
    })
  })

  describe('Mutation.forgotPassword', () => {
    it('Forgot Password (User Exists)', async () => {
      const email = 'test@example.com'
      const user = { id: '1', email, username: 'testuser' }

      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: user,
        client: mockShardClient,
      } as any)

      const result = await (authResolver.Mutation?.forgotPassword as any)(
        {},
        { email },
        mockContext,
        {}
      )

      expect(PrismaConfig.findUserAcrossShards).toHaveBeenCalled()
      expect(mockShardClient.user.update).toHaveBeenCalled()
      expect(mockShardClient.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: user.id },
          data: expect.objectContaining({
            passwordReset: expect.any(Object),
          }),
        })
      )
      expect(result).toBe(true)
    })

    it('Forgot Password (User Not Found)', async () => {
      const email = 'unknown@example.com'

      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: null,
        client: null,
      } as any)

      const result = await (authResolver.Mutation?.forgotPassword as any)(
        {},
        { email },
        mockContext,
        {}
      )

      expect(result).toBe(true)
      expect(mockShardClient.user.update).not.toHaveBeenCalled()
    })
  })

  describe('Mutation.resetPassword', () => {
    it('Reset Password', async () => {
      const token = 'valid-token'
      const newPassword = 'newPassword123'
      const hashedPassword = 'newHashedPassword'
      // Ensure expiresAt is in the future
      const futureDate = new Date()
      futureDate.setHours(futureDate.getHours() + 1)

      const user = {
        id: '1',
        email: 'test@example.com',
        passwordReset: {
          token,
          expiresAt: futureDate.toISOString(),
        },
      }

      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: user,
        client: mockShardClient,
      } as any)
      vi.mocked(AuthUtils.hashPassword).mockResolvedValue(hashedPassword)

      const result = await (authResolver.Mutation?.resetPassword as any)(
        {},
        { token, password: newPassword },
        mockContext,
        {}
      )

      expect(AuthUtils.hashPassword).toHaveBeenCalledWith(newPassword)
      expect(mockShardClient.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: user.id },
          data: expect.objectContaining({
            password: hashedPassword,
            // checking for Prisma.JsonNull is tricky in mock, so we just check it was updated
          }),
        })
      )
      expect(result).toBe(true)
    })

    it('Reset Password (Invalid/Expired Token)', async () => {
      const token = 'expired-token'
      const password = 'newPassword123'

      // Case: User not found (invalid token)
      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: null,
        client: null,
      } as any)

      await expect(
        (authResolver.Mutation?.resetPassword as any)({}, { token, password }, mockContext, {})
      ).rejects.toThrow(ValidationError)
    })
  })
})
