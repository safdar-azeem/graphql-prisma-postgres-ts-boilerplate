import { authResolver } from './auth.resolver'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Context } from '@/types/context.type'
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended'
import { AuthenticationError, ValidationError } from '@/errors'
import * as PrismaConfig from '@/config/prisma'
import * as AuthUtils from '../utils/auth.utils'

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

describe('Auth Resolver', () => {
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
    it('should create a new user and return user and token', async () => {
      const inputData = { email: 'test@example.com', username: 'testuser', password: 'password123' }
      const hashedPassword = 'hashedPassword'
      const token = 'jwt.token'
      const createdUser = { id: '1', ...inputData, password: hashedPassword }

      // Mock findUserAcrossShards to return null (user doesn't exist)
      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: null,
        client: null,
      } as any)

      // Mock hashPassword
      vi.mocked(AuthUtils.hashPassword).mockResolvedValue(hashedPassword)

      // Mock sharding.getRandomShard
      vi.mocked(PrismaConfig.sharding.getRandomShard).mockReturnValue(mockShardClient)

      // Mock prisma create
      mockShardClient.user.create.mockResolvedValue(createdUser)

      // Mock generateToken
      vi.mocked(AuthUtils.generateToken).mockReturnValue(token)

      const result = await (authResolver.Mutation?.signup as any)(
        {},
        { data: inputData },
        mockContext,
        {}
      )

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
    })

    it('should throw ValidationError if user already exists', async () => {
      const inputData = { email: 'test@example.com', username: 'testuser', password: 'password123' }
      const existingUser = { id: '1', ...inputData }

      // Mock findUserAcrossShards to return existing user
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
    it('should login successfully and return token', async () => {
      const inputData = { email: 'test@example.com', password: 'password123' }
      const hashedPassword = 'hashedPassword'
      const user = {
        id: '1',
        email: inputData.email,
        password: hashedPassword,
        username: 'testuser',
      }
      const token = 'jwt.token'

      // Mock findUserAcrossShards to return user
      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: user,
        client: mockShardClient,
      } as any)

      // Mock comparePassword
      vi.mocked(AuthUtils.comparePassword).mockResolvedValue(true)

      // Mock generateToken
      vi.mocked(AuthUtils.generateToken).mockReturnValue(token)

      const { password: _, ...userWithoutPassword } = user

      const result = await (authResolver.Mutation?.login as any)(
        {},
        { data: inputData },
        mockContext,
        {}
      )

      expect(PrismaConfig.findUserAcrossShards).toHaveBeenCalled()
      expect(AuthUtils.comparePassword).toHaveBeenCalledWith(inputData.password, user.password)
      expect(AuthUtils.generateToken).toHaveBeenCalled()
      expect(result).toEqual({ token, user: userWithoutPassword })
    })

    it('should throw AuthenticationError if invalid password', async () => {
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

    it('should throw AuthenticationError if user not found', async () => {
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
})
