import { describe, it, expect, vi, beforeEach } from 'vitest'

const findUnique = vi.fn()
const create = vi.fn()
const update = vi.fn()
const updateMany = vi.fn()
const deleteMany = vi.fn()

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
}))

describe('email reservation lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    deleteMany.mockResolvedValue({ count: 0 })
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

  it('reclaims expired PENDING rows before reserving', async () => {
    findUnique.mockResolvedValue(null)
    create.mockResolvedValue({})
    deleteMany.mockResolvedValue({ count: 1 })

    const { reserveEmail } = await import('@/identity/email-reservation.service')
    await reserveEmail({
      email: 'a@b.com',
      userId: 'u2',
      workspaceId: 'ws-2',
      shardId: 'shard_1',
    })

    expect(deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: 'a@b.com',
          status: 'PENDING',
        }),
      })
    )
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
