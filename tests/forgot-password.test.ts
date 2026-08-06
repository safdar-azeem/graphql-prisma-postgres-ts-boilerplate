import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as PrismaConfig from '@/config/prisma'
import * as EmailUtil from '@/utils/email.util'
import * as AuthService from '@/modules/auth/services/auth.service'

vi.mock('@/config/prisma', () => ({
  findUserAcrossShards: vi.fn(),
  assignWorkspaceShard: vi.fn(),
  getDbForWorkspace: vi.fn(),
}))

vi.mock('@/utils/email.util', () => ({
  sendEmail: vi.fn().mockResolvedValue('ok'),
}))

vi.mock('@/cache', () => ({
  cache: { invalidateUser: vi.fn() },
}))

vi.mock('@/identity/email-reservation.service', () => ({
  reserveEmail: vi.fn(),
  activateEmailReservation: vi.fn(),
  releaseEmailReservation: vi.fn(),
  findIdentityByEmail: vi.fn().mockResolvedValue(null),
}))

describe('forgotPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the same public result whether or not the email exists', async () => {
    vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
      result: null,
      client: null,
      shardId: null,
    })
    const missing = await AuthService.forgotPassword('missing@example.com')

    const client = {
      user: { update: vi.fn().mockResolvedValue({}) },
    }
    vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
      result: { id: 'u1', email: 'known@example.com' },
      client,
      shardId: 'shard_1',
    } as any)
    const known = await AuthService.forgotPassword('known@example.com')

    expect(missing).toBe(true)
    expect(known).toBe(true)
    expect(missing).toEqual(known)
  })

  it('does not reveal email send failures for known users', async () => {
    const client = {
      user: { update: vi.fn().mockResolvedValue({}) },
    }
    vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
      result: { id: 'u1', email: 'known@example.com' },
      client,
      shardId: 'shard_1',
    } as any)
    vi.mocked(EmailUtil.sendEmail).mockRejectedValueOnce(new Error('smtp down'))

    await expect(AuthService.forgotPassword('known@example.com')).resolves.toBe(true)
  })
})
