import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthenticationError, ConflictError } from '@/errors'
import * as PrismaConfig from '@/config/prisma'
import * as AuthUtils from '../utils/auth.utils'
import * as TokenConfig from '@/config/tokens'
import * as AuthService from '../services/auth.service'

const UserType = { OWNER: 'OWNER', MEMBER: 'MEMBER' } as const
const UserStatus = { ACTIVE: 'ACTIVE' } as const

vi.mock('@/config/prisma', () => ({
  findUserAcrossShards: vi.fn(),
  assignWorkspaceShard: vi.fn(),
  getDbForWorkspace: vi.fn(),
  sharding: {},
}))

vi.mock('../utils/auth.utils', () => ({
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
}))

vi.mock('@/config/tokens', async () => {
  const actual = await vi.importActual<typeof import('@/config/tokens')>('@/config/tokens')
  return {
    ...actual,
    generateTokenPair: vi.fn(),
    generateAccessToken: vi.fn(),
  }
})

vi.mock('@/cache/refreshToken.cache', () => ({
  storeRefreshToken: vi.fn(),
  revokeAllRefreshTokens: vi.fn(),
  revokeRefreshToken: vi.fn(),
  assertRotated: vi.fn(),
}))

vi.mock('@/cache', () => ({
  cache: { invalidateUser: vi.fn() },
}))

vi.mock('@/utils/email.util', () => ({
  sendEmail: vi.fn().mockResolvedValue('ok'),
}))

vi.mock('@/identity/email-reservation.service', () => ({
  reserveEmail: vi.fn().mockResolvedValue(undefined),
  activateEmailReservation: vi.fn().mockResolvedValue(undefined),
  releaseEmailReservation: vi.fn().mockResolvedValue(undefined),
  findIdentityByEmail: vi.fn().mockResolvedValue(null),
}))

import * as EmailReservation from '@/identity/email-reservation.service'

describe('Auth Service', () => {
  let mockClient: any

  beforeEach(() => {
    mockClient = {
      workspace: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      role: { create: vi.fn() },
      $transaction: vi.fn(async (fn: any) => fn(mockClient)),
    }
    vi.clearAllMocks()
    vi.mocked(EmailReservation.reserveEmail).mockResolvedValue(undefined)
  })

  describe('signup', () => {
    it('creates workspace and owner transactionally', async () => {
      const createdUser = {
        id: 'owner-1',
        email: 'test@example.com',
        username: 'testuser',
        password: 'hashed',
        userType: UserType.OWNER,
        workspaceId: 'ws-1',
        status: UserStatus.ACTIVE,
      }

      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: null,
        client: null,
        shardId: null,
      })
      vi.mocked(PrismaConfig.assignWorkspaceShard).mockReturnValue({
        client: mockClient,
        shardId: 'shard_1',
      })
      mockClient.workspace.findUnique.mockResolvedValue(null)
      mockClient.workspace.create.mockResolvedValue({ id: 'ws-1', slug: 'acme' })
      mockClient.user.create.mockResolvedValue(createdUser)
      mockClient.workspace.update.mockResolvedValue({ id: 'ws-1', ownerId: 'owner-1' })
      mockClient.role.create.mockResolvedValue({ id: 'role-1' })
      vi.mocked(AuthUtils.hashPassword).mockResolvedValue('hashed')
      vi.mocked(TokenConfig.generateTokenPair).mockReturnValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        jti: 'jti-1',
      })

      const result = await AuthService.signup({
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        workspaceName: 'Acme',
      })

      expect(result.token).toBe('access')
      expect((result.user as any).password).toBeUndefined()
      expect(mockClient.$transaction).toHaveBeenCalled()
    })

    it('rejects reserved or existing emails via control-plane reservation', async () => {
      vi.mocked(PrismaConfig.assignWorkspaceShard).mockReturnValue({
        client: mockClient,
        shardId: 'shard_1',
      })
      vi.mocked(EmailReservation.reserveEmail).mockRejectedValueOnce(
        new ConflictError('A user with this email already exists')
      )

      await expect(
        AuthService.signup({
          email: 'test@example.com',
          username: 'testuser',
          password: 'password123',
          workspaceName: 'Acme',
        })
      ).rejects.toBeInstanceOf(ConflictError)
    })
  })

  describe('login', () => {
    it('logs in with globally unique email', async () => {
      const user = {
        id: '1',
        email: 'test@example.com',
        password: 'hashed',
        userType: UserType.OWNER,
        workspaceId: 'ws-1',
        status: UserStatus.ACTIVE,
        mfaSettings: null,
      }

      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: user as any,
        client: mockClient,
        shardId: 'shard_1',
      })
      mockClient.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        status: 'ACTIVE',
      })
      vi.mocked(AuthUtils.comparePassword).mockResolvedValue(true)
      vi.mocked(TokenConfig.generateTokenPair).mockReturnValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        jti: 'jti-1',
      })

      const result = await AuthService.login({
        email: 'test@example.com',
        password: 'password123',
      })

      expect(result.token).toBe('access')
    })

    it('rejects invalid password', async () => {
      vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
        result: {
          id: '1',
          email: 'test@example.com',
          password: 'hashed',
          userType: UserType.OWNER,
          workspaceId: 'ws-1',
          status: UserStatus.ACTIVE,
        } as any,
        client: mockClient,
        shardId: 'shard_1',
      })
      mockClient.workspace.findUnique.mockResolvedValue({ id: 'ws-1', status: 'ACTIVE' })
      vi.mocked(AuthUtils.comparePassword).mockResolvedValue(false)

      await expect(
        AuthService.login({ email: 'test@example.com', password: 'wrong' })
      ).rejects.toBeInstanceOf(AuthenticationError)
    })
  })
})
