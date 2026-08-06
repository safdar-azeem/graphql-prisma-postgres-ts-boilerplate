import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthenticationError } from '@/errors'
import * as PrismaConfig from '@/config/prisma'
import * as TokenConfig from '@/config/tokens'
import * as AuthService from '@/modules/auth/services/auth.service'

vi.mock('@/config/prisma', () => ({
  findUserAcrossShards: vi.fn(),
  getDbForWorkspace: vi.fn(() => ({})),
  assignWorkspaceShard: vi.fn(),
}))

vi.mock('@/config/tokens', async () => {
  const actual = await vi.importActual<typeof import('@/config/tokens')>('@/config/tokens')
  return {
    ...actual,
    verifyAccessToken: vi.fn(),
    generateTokenPair: vi.fn(),
  }
})

vi.mock('@/cache/refreshToken.cache', () => ({
  storeRefreshToken: vi.fn(),
  revokeAllRefreshTokens: vi.fn(),
}))

vi.mock('@/cache', () => ({
  cache: { invalidateUser: vi.fn() },
}))

describe('verify2FA status checks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(TokenConfig.verifyAccessToken).mockReturnValue({
      _id: 'user-1',
      is2faPending: true,
      workspaceId: 'ws-1',
    } as any)
  })

  it('rejects suspended users during MFA completion', async () => {
    vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
      result: {
        id: 'user-1',
        status: 'SUSPENDED',
        workspaceId: 'ws-1',
        mfaSettings: { isEnabled: true, method: 'EMAIL' },
        workspace: { status: 'ACTIVE', shardId: 'shard_1' },
      } as any,
      client: { user: { update: vi.fn() } },
      shardId: 'shard_1',
    })

    await expect(AuthService.verify2FA('token', '123456')).rejects.toBeInstanceOf(
      AuthenticationError
    )
  })

  it('rejects suspended workspaces during MFA completion', async () => {
    vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
      result: {
        id: 'user-1',
        status: 'ACTIVE',
        workspaceId: 'ws-1',
        mfaSettings: { isEnabled: true, method: 'EMAIL' },
        workspace: { status: 'SUSPENDED', shardId: 'shard_1' },
      } as any,
      client: { user: { update: vi.fn() } },
      shardId: 'shard_1',
    })

    await expect(AuthService.verify2FA('token', '123456')).rejects.toBeInstanceOf(
      AuthenticationError
    )
  })
})
