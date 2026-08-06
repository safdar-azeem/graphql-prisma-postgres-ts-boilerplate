import { describe, it, expect, vi, beforeEach } from 'vitest'

const findUnique = vi.fn()
const findFirst = vi.fn()
const create = vi.fn()
const update = vi.fn()
const updateMany = vi.fn()
const deleteMany = vi.fn()
const getDbForWorkspace = vi.fn()

vi.mock('@/config/prisma', () => ({
  prisma: {
    globalEmailReservation: {
      findUnique: (...args: any[]) => findUnique(...args),
      create: (...args: any[]) => create(...args),
      update: (...args: any[]) => update(...args),
      updateMany: (...args: any[]) => updateMany(...args),
      deleteMany: (...args: any[]) => deleteMany(...args),
    },
  },
  getDbForWorkspace: (...args: any[]) => getDbForWorkspace(...args),
}))

vi.mock('@/config/logger', () => ({
  logDependencyFailure: vi.fn(),
}))

describe('email reservation lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    deleteMany.mockResolvedValue({ count: 0 })
    updateMany.mockResolvedValue({ count: 1 })
  })

  it('creates a PENDING reservation with routing fields', async () => {
    findUnique.mockResolvedValue(null)
    create.mockResolvedValue({})

    const { reserveEmail } = await import('@/identity/email-reservation.service')
    await reserveEmail({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'shard_1',
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'a@b.com',
          userId: 'u1',
          workspaceId: 'ws-1',
          shardId: 'shard_1',
          status: 'PENDING',
        }),
      })
    )
  })

  it('activates expired PENDING when shard user exists', async () => {
    findUnique.mockResolvedValue({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'shard_2',
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 1000),
    })
    getDbForWorkspace.mockReturnValue({
      user: { findFirst },
    })
    findFirst.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      workspaceId: 'ws-1',
    })

    const { reconcileExpiredPendingReservation } = await import(
      '@/identity/email-reservation.service'
    )
    await expect(reconcileExpiredPendingReservation('a@b.com')).resolves.toBe('activated')
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACTIVE', expiresAt: null }),
      })
    )
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it('releases expired PENDING when shard user is missing', async () => {
    findUnique.mockResolvedValue({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'shard_2',
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 1000),
    })
    getDbForWorkspace.mockReturnValue({
      user: { findFirst },
    })
    findFirst.mockResolvedValue(null)
    deleteMany.mockResolvedValue({ count: 1 })

    const { reconcileExpiredPendingReservation } = await import(
      '@/identity/email-reservation.service'
    )
    await expect(reconcileExpiredPendingReservation('a@b.com')).resolves.toBe('released')
    expect(deleteMany).toHaveBeenCalled()
  })

  it('keeps expired PENDING when recorded shard is unavailable', async () => {
    findUnique.mockResolvedValue({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'missing',
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 1000),
    })
    getDbForWorkspace.mockImplementation(() => {
      throw new Error('shard missing')
    })

    const { reconcileExpiredPendingReservation } = await import(
      '@/identity/email-reservation.service'
    )
    await expect(reconcileExpiredPendingReservation('a@b.com')).rejects.toMatchObject({
      name: 'DependencyUnavailableError',
    })
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it('rejects ACTIVE reservations', async () => {
    findUnique.mockResolvedValue({
      email: 'a@b.com',
      userId: 'other',
      status: 'ACTIVE',
    })

    const { reserveEmail } = await import('@/identity/email-reservation.service')
    await expect(
      reserveEmail({
        email: 'a@b.com',
        userId: 'u1',
        workspaceId: 'ws-1',
        shardId: 'shard_1',
      })
    ).rejects.toMatchObject({
      message: 'A user with this email already exists',
      name: 'ConflictError',
    })
  })

  it('releases only when email and userId match', async () => {
    deleteMany.mockResolvedValue({ count: 1 })
    const { releaseEmailReservation } = await import('@/identity/email-reservation.service')
    await releaseEmailReservation('a@b.com', 'u1')
    expect(deleteMany).toHaveBeenCalledWith({ where: { email: 'a@b.com', userId: 'u1' } })
  })

  it('propagates release failures instead of swallowing them', async () => {
    deleteMany.mockRejectedValue(new Error('control plane down'))
    const { releaseEmailReservation } = await import('@/identity/email-reservation.service')
    await expect(releaseEmailReservation('a@b.com', 'u1')).rejects.toThrow(/control plane down/)
  })

  it('returns ACTIVE identity routes for login', async () => {
    findUnique.mockResolvedValue({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'shard_2',
      status: 'ACTIVE',
    })
    const { findIdentityByEmail } = await import('@/identity/email-reservation.service')
    await expect(findIdentityByEmail('a@b.com')).resolves.toEqual({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'shard_2',
      status: 'ACTIVE',
    })
  })
})
