import { authResolver } from '../resolvers/auth.resolver'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UserType } from '@/generated/prisma/client'
import { Context } from '@/types/context.type'
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended'
import { AuthenticationError, ValidationError } from '@/errors'
import * as ShardingConfig from '@/config/sharding'
import * as AuthUtils from '../utils/auth.utils'
import * as TokenConfig from '@/config/tokens'
import * as RefreshTokenCache from '@/cache/refreshToken.cache'
import { authLite } from '@/config/authlite'
import { ShardSearchIncompleteError, ShardUnavailableError } from 'prisma-sharding'

vi.mock('@/config/sharding', () => ({
  sharding: {
    allocateShard: vi.fn(),
    resolveShard: vi.fn(),
    findAcrossShards: vi.fn(),
  },
}))

vi.mock('../utils/auth.utils', () => ({
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
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
    google: { verify: vi.fn() },
  },
}))

vi.mock('@/cache', () => ({
  cache: { invalidateUser: vi.fn() },
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
      const inputData = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
      }
      const hashedPassword = 'hashedPassword'
      const accessToken = 'jwt.access.token'
      const refreshToken = 'jwt.refresh.token'
      // Resolver destructures password out before returning, so returned user has no password
      const createdUser = {
        id: '1',
        email: inputData.email,
        username: inputData.username,
        password: hashedPassword,
        userType: UserType.OWNER,
      }

      vi.mocked(ShardingConfig.sharding.findAcrossShards).mockResolvedValue({
        data: null,
        client: null,
        shardId: null,
      })
      vi.mocked(AuthUtils.hashPassword).mockResolvedValue(hashedPassword)
      vi.mocked(ShardingConfig.sharding.allocateShard).mockResolvedValue(mockShardClient)
      mockShardClient.user.create.mockResolvedValue(createdUser)
      vi.mocked(TokenConfig.generateTokenPair).mockReturnValue({
        accessToken,
        refreshToken,
        jti: 'jti-uuid',
      })

      const result = await (authResolver.Mutation?.signup as any)(
        {},
        { data: inputData },
        mockContext,
        {}
      )

      expect(ShardingConfig.sharding.findAcrossShards).toHaveBeenCalledTimes(1)
      expect(ShardingConfig.sharding.allocateShard).toHaveBeenCalledWith(expect.any(String))
      expect(AuthUtils.hashPassword).toHaveBeenCalledWith(inputData.password)
      expect(mockShardClient.user.create).toHaveBeenCalledWith({
        data: {
          id: expect.any(String),
          email: inputData.email,
          username: inputData.username,
          password: hashedPassword,
          userType: UserType.OWNER,
        },
      })
      expect(TokenConfig.generateTokenPair).toHaveBeenCalledWith(
        expect.objectContaining({ id: createdUser.id, email: createdUser.email })
      )
      expect(RefreshTokenCache.storeRefreshToken).toHaveBeenCalledWith(createdUser.id, 'jti-uuid')

      // password must be stripped from returned user
      const { password: _, ...expectedUser } = createdUser
      expect(result).toEqual({ token: accessToken, refreshToken, user: expectedUser })
    })

    it('Create a new user (Existing)', async () => {
      const inputData = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
      }
      const existingUser = { id: '1', email: inputData.email, userType: UserType.OWNER }

      vi.mocked(ShardingConfig.sharding.findAcrossShards).mockResolvedValue({
        data: existingUser,
        client: mockShardClient,
        shardId: 'shard_1',
      })

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
        ownerId: 'owner-1',
        email: inputData.email,
        password: hashedPassword,
        username: 'testuser',
        userType: UserType.EMPLOYEE,
        mfaSettings: null,
      }
      const accessToken = 'jwt.access.token'
      const refreshToken = 'jwt.refresh.token'

      vi.mocked(ShardingConfig.sharding.findAcrossShards).mockResolvedValue({
        data: user,
        client: mockShardClient,
        shardId: 'shard_1',
      })
      vi.mocked(ShardingConfig.sharding.resolveShard).mockResolvedValue(mockShardClient)
      vi.mocked(AuthUtils.comparePassword).mockResolvedValue(true)
      vi.mocked(TokenConfig.generateTokenPair).mockReturnValue({
        accessToken,
        refreshToken,
        jti: 'jti-uuid',
      })

      const result = await (authResolver.Mutation?.login as any)(
        {},
        { data: inputData },
        mockContext,
        {}
      )

      expect(AuthUtils.comparePassword).toHaveBeenCalledWith(inputData.password, user.password)
      expect(ShardingConfig.sharding.resolveShard).toHaveBeenCalledWith('owner-1')
      expect(TokenConfig.generateTokenPair).toHaveBeenCalled()
      expect(RefreshTokenCache.storeRefreshToken).toHaveBeenCalledWith(user.id, 'jti-uuid')

      const { password: _, ...userWithoutPassword } = user
      expect(result).toEqual({ token: accessToken, refreshToken, user: userWithoutPassword })
    })

    it('Login user (Invalid Password)', async () => {
      const inputData = { email: 'test@example.com', password: 'wrongpassword' }
      const user = {
        id: '1',
        email: inputData.email,
        password: 'hashedPassword',
        username: 'testuser',
        mfaSettings: null,
      }

      vi.mocked(ShardingConfig.sharding.findAcrossShards).mockResolvedValue({
        data: user,
        client: mockShardClient,
        shardId: 'shard_1',
      })
      vi.mocked(ShardingConfig.sharding.resolveShard).mockResolvedValue(mockShardClient)
      vi.mocked(AuthUtils.comparePassword).mockResolvedValue(false)

      await expect(
        (authResolver.Mutation?.login as any)({}, { data: inputData }, mockContext, {})
      ).rejects.toThrow(AuthenticationError)
    })

    it('Login user (User Not Found)', async () => {
      const inputData = { email: 'notfound@example.com', password: 'password' }

      vi.mocked(ShardingConfig.sharding.findAcrossShards).mockResolvedValue({
        data: null,
        client: null,
        shardId: null,
      })

      await expect(
        (authResolver.Mutation?.login as any)({}, { data: inputData }, mockContext, {})
      ).rejects.toThrow(AuthenticationError)
    })

    it('does not interpret incomplete discovery as user not found', async () => {
      const error = new ShardSearchIncompleteError(['shard_2'])
      vi.mocked(ShardingConfig.sharding.findAcrossShards).mockRejectedValue(error)

      await expect(
        (authResolver.Mutation?.login as any)(
          {},
          { data: { email: 'test@example.com', password: 'password' } },
          mockContext,
          {}
        )
      ).rejects.toBe(error)
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
        password: 'hashed',
        mfaSettings: null,
        userType: UserType.OWNER,
      }
      const accessToken = 'jwt.access.token'
      const refreshToken = 'jwt.refresh.token'

      vi.mocked(authLite.google.verify).mockResolvedValue(googleUser as any)
      vi.mocked(ShardingConfig.sharding.findAcrossShards).mockResolvedValue({
        data: existingUser,
        client: mockShardClient,
        shardId: 'shard_1',
      })
      vi.mocked(ShardingConfig.sharding.resolveShard).mockResolvedValue(mockShardClient)
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

    it('does not convert shard unavailability into a Google authentication error', async () => {
      const error = new ShardUnavailableError('shard_1', 'unavailable')
      vi.mocked(authLite.google.verify).mockResolvedValue({
        email: 'test@example.com',
        name: 'Test User',
        googleId: '123',
      } as any)
      vi.mocked(ShardingConfig.sharding.findAcrossShards).mockRejectedValue(error)

      await expect(
        (authResolver.Mutation?.googleLogin as any)(
          {},
          { token: 'google.token' },
          mockContext,
          {}
        )
      ).rejects.toBe(error)
    })
  })

  describe('Mutation.forgotPassword', () => {
    it('Forgot Password (User Exists)', async () => {
      const email = 'test@example.com'
      const user = { id: '1', email, username: 'testuser' }

      vi.mocked(ShardingConfig.sharding.findAcrossShards).mockResolvedValue({
        data: user,
        client: mockShardClient,
        shardId: 'shard_1',
      })
      vi.mocked(ShardingConfig.sharding.resolveShard).mockResolvedValue(mockShardClient)

      const result = await (authResolver.Mutation?.forgotPassword as any)(
        {},
        { email },
        mockContext,
        {}
      )

      expect(mockShardClient.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: user.id },
          data: expect.objectContaining({ passwordReset: expect.any(Object) }),
        })
      )
      expect(result).toBe(true)
    })

    it('Forgot Password (User Not Found)', async () => {
      vi.mocked(ShardingConfig.sharding.findAcrossShards).mockResolvedValue({
        data: null,
        client: null,
        shardId: null,
      })

      const result = await (authResolver.Mutation?.forgotPassword as any)(
        {},
        { email: 'unknown@example.com' },
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
      const futureDate = new Date()
      futureDate.setHours(futureDate.getHours() + 1)

      const user = {
        id: '1',
        email: 'test@example.com',
        passwordReset: { token, expiresAt: futureDate.toISOString() },
      }

      vi.mocked(ShardingConfig.sharding.findAcrossShards).mockResolvedValue({
        data: user,
        client: mockShardClient,
        shardId: 'shard_1',
      })
      vi.mocked(ShardingConfig.sharding.resolveShard).mockResolvedValue(mockShardClient)
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
          data: expect.objectContaining({ password: hashedPassword }),
        })
      )
      expect(result).toBe(true)
    })

    it('Reset Password (Invalid/Expired Token)', async () => {
      vi.mocked(ShardingConfig.sharding.findAcrossShards).mockResolvedValue({
        data: null,
        client: null,
        shardId: null,
      })

      await expect(
        (authResolver.Mutation?.resetPassword as any)(
          {},
          { token: 'bad', password: 'newPass' },
          mockContext,
          {}
        )
      ).rejects.toThrow(ValidationError)
    })
  })
})
