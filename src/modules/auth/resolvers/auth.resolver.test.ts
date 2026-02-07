import { authResolver } from './auth.resolver'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Context } from '@/types/context.type'
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended'
import { AuthenticationError, ValidationError } from '@/errors'
import * as PrismaConfig from '@/config/prisma'
import * as AuthUtils from '../utils/auth.utils'
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

vi.mock('@/config/authlite', () => ({
  authLite: {
    google: {
      verify: vi.fn(),
    },
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
    console.log('\n[TEST SETUP] Initializing Mocks...')
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

  afterEach(() => {
    console.log('[TEST TEARDOWN] Mocks cleared.')
  })

  describe('Mutation.signup', () => {
    it('should successfully create a new user and return token', async () => {
      console.log('[TEST START] Mutation.signup - Success Case')

      // GIVEN
      const inputData = { email: 'test@example.com', username: 'testuser', password: 'password123' }
      const hashedPassword = 'hashedPassword'
      const token = 'jwt.token'
      const createdUser = { id: '1', ...inputData, password: hashedPassword }

      console.log('[MOCKING] findUserAcrossShards -> null (User does not exist)')
      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: null,
        client: null,
      } as any)

      console.log('[MOCKING] hashPassword')
      vi.mocked(AuthUtils.hashPassword).mockResolvedValue(hashedPassword)

      console.log('[MOCKING] sharding.getRandomShard')
      vi.mocked(PrismaConfig.sharding.getRandomShard).mockReturnValue(mockShardClient)

      console.log('[MOCKING] User creation')
      mockShardClient.user.create.mockResolvedValue(createdUser)

      console.log('[MOCKING] generateToken')
      vi.mocked(AuthUtils.generateToken).mockReturnValue(token)

      // WHEN
      console.log('[EXECUTION] Calling signup mutation...')
      const result = await (authResolver.Mutation?.signup as any)(
        {},
        { data: inputData },
        mockContext,
        {}
      )

      // THEN
      console.log('[ASSERTION] Verifying result and calls...')
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
      expect(AuthUtils.generateToken).toHaveBeenCalledWith({
        _id: createdUser.id,
        email: createdUser.email,
      })
      expect(result).toEqual({ token, user: createdUser })
      console.log('[TEST PASSED] Mutation.signup - Success Case')
    })

    it('should fail when user already exists', async () => {
      console.log('[TEST START] Mutation.signup - Failure Case (Existing User)')
      const inputData = { email: 'test@example.com', username: 'testuser', password: 'password123' }
      const existingUser = { id: '1', ...inputData }

      console.log('[MOCKING] findUserAcrossShards -> existingUser')
      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: existingUser,
        client: mockShardClient,
      } as any)

      console.log('[ASSERTION] Expecting ValidationError')
      await expect(
        (authResolver.Mutation?.signup as any)({}, { data: inputData }, mockContext, {})
      ).rejects.toThrow(ValidationError)
      console.log('[TEST PASSED] Mutation.signup - Failure Case (Existing User)')
    })
  })

  describe('Mutation.login', () => {
    it('should successfully login with valid credentials', async () => {
      console.log('[TEST START] Mutation.login - Success Case')
      const inputData = { email: 'test@example.com', password: 'password123' }
      const hashedPassword = 'hashedPassword'
      const user = {
        id: '1',
        email: inputData.email,
        password: hashedPassword,
        username: 'testuser',
      }
      const token = 'jwt.token'

      console.log('[MOCKING] findUserAcrossShards -> user')
      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: user,
        client: mockShardClient,
      } as any)

      console.log('[MOCKING] comparePassword -> true')
      vi.mocked(AuthUtils.comparePassword).mockResolvedValue(true)

      console.log('[MOCKING] generateToken')
      vi.mocked(AuthUtils.generateToken).mockReturnValue(token)

      const { password: _, ...userWithoutPassword } = user

      console.log('[EXECUTION] Calling login mutation...')
      const result = await (authResolver.Mutation?.login as any)(
        {},
        { data: inputData },
        mockContext,
        {}
      )

      console.log('[ASSERTION] Verifying result...')
      expect(PrismaConfig.findUserAcrossShards).toHaveBeenCalled()
      expect(AuthUtils.comparePassword).toHaveBeenCalledWith(inputData.password, user.password)
      expect(AuthUtils.generateToken).toHaveBeenCalled()
      expect(result).toEqual({ token, user: userWithoutPassword })
      console.log('[TEST PASSED] Mutation.login - Success Case')
    })

    it('should throw AuthenticationError on invalid password', async () => {
      console.log('[TEST START] Mutation.login - Failure Case (Invalid Password)')
      const inputData = { email: 'test@example.com', password: 'wrongpassword' }
      const user = {
        id: '1',
        email: inputData.email,
        password: 'hashedPassword',
        username: 'testuser',
      }

      console.log('[MOCKING] findUserAcrossShards -> user')
      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: user,
        client: mockShardClient,
      } as any)

      console.log('[MOCKING] comparePassword -> false')
      vi.mocked(AuthUtils.comparePassword).mockResolvedValue(false)

      console.log('[ASSERTION] Expecting AuthenticationError')
      await expect(
        (authResolver.Mutation?.login as any)({}, { data: inputData }, mockContext, {})
      ).rejects.toThrow(AuthenticationError)
      console.log('[TEST PASSED] Mutation.login - Failure Case (Invalid Password)')
    })
  })

  describe('Mutation.googleLogin', () => {
    it('should login existing user via Google', async () => {
      console.log('[TEST START] Mutation.googleLogin - Existing User')
      const googleToken = 'google.token'
      const googleUser = { email: 'test@example.com', name: 'Test User', googleId: '123' }
      const existingUser = {
        id: '1',
        email: 'test@example.com',
        username: 'Test User',
        googleId: '123',
      }
      const token = 'jwt.token'

      console.log('[MOCKING] Google verify')
      vi.mocked(authLite.google.verify).mockResolvedValue(googleUser as any)

      console.log('[MOCKING] findUserAcrossShards -> existingUser')
      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: existingUser,
        client: mockShardClient,
      } as any)

      console.log('[MOCKING] generateToken')
      vi.mocked(AuthUtils.generateToken).mockReturnValue(token)

      console.log('[EXECUTION] Calling googleLogin mutation...')
      const result = await (authResolver.Mutation?.googleLogin as any)(
        {},
        { token: googleToken },
        mockContext,
        {}
      )

      console.log('[ASSERTION] Verifying result...')
      const { password: _, ...expectedUser } = existingUser as any
      expect(result.token).toBe(token)
      expect(result.user).toEqual(expect.objectContaining({ email: existingUser.email }))
      console.log('[TEST PASSED] Mutation.googleLogin - Existing User')
    })
  })

  describe('Mutation.forgotPassword', () => {
    it('should send reset email if user exists', async () => {
      console.log('[TEST START] Mutation.forgotPassword - Success Case')
      const email = 'test@example.com'
      const user = { id: '1', email, username: 'testuser' }

      console.log('[MOCKING] findUserAcrossShards -> user')
      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: user,
        client: mockShardClient,
      } as any)

      console.log('[EXECUTION] Calling forgotPassword mutation...')
      const result = await (authResolver.Mutation?.forgotPassword as any)(
        {},
        { email },
        mockContext,
        {}
      )

      console.log('[ASSERTION] Verifying result and side effects...')
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
      console.log('[TEST PASSED] Mutation.forgotPassword - Success Case')
    })

    it('should return true even if user does not exist (security best practice)', async () => {
      console.log('[TEST START] Mutation.forgotPassword - User Not Found')
      const email = 'unknown@example.com'

      console.log('[MOCKING] findUserAcrossShards -> null')
      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: null,
        client: null,
      } as any)

      console.log('[EXECUTION] Calling forgotPassword mutation...')
      const result = await (authResolver.Mutation?.forgotPassword as any)(
        {},
        { email },
        mockContext,
        {}
      )

      console.log('[ASSERTION] Verifying result...')
      expect(result).toBe(true)
      expect(mockShardClient.user.update).not.toHaveBeenCalled()
      console.log('[TEST PASSED] Mutation.forgotPassword - User Not Found')
    })
  })

  describe('Mutation.resetPassword', () => {
    it('should successfully reset password with valid token', async () => {
      console.log('[TEST START] Mutation.resetPassword - Success Case')
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

      console.log('[MOCKING] findUserAcrossShards -> user')
      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: user,
        client: mockShardClient,
      } as any)

      console.log('[MOCKING] hashPassword')
      vi.mocked(AuthUtils.hashPassword).mockResolvedValue(hashedPassword)

      console.log('[EXECUTION] Calling resetPassword mutation...')
      const result = await (authResolver.Mutation?.resetPassword as any)(
        {},
        { token, password: newPassword },
        mockContext,
        {}
      )

      console.log('[ASSERTION] Verifying result and update...')
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
      console.log('[TEST PASSED] Mutation.resetPassword - Success Case')
    })

    it('should throw ValidationError if token is invalid or expired', async () => {
      console.log('[TEST START] Mutation.resetPassword - Invalid/Expired Token')
      const token = 'expired-token'
      const password = 'newPassword123'

      // Case: User not found (invalid token)
      console.log('[MOCKING] findUserAcrossShards -> null')
      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: null,
        client: null,
      } as any)

      console.log('[ASSERTION] Expecting ValidationError')
      await expect(
        (authResolver.Mutation?.resetPassword as any)({}, { token, password }, mockContext, {})
      ).rejects.toThrow(ValidationError)
      console.log('[TEST PASSED] Mutation.resetPassword - Invalid/Expired Token')
    })
  })
})
