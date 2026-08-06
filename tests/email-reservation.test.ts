import { describe, it, expect, vi, beforeEach } from 'vitest'

const findUnique = vi.fn()
const findFirst = vi.fn()
const findMany = vi.fn()
const create = vi.fn()
const update = vi.fn()
const updateMany = vi.fn()
const deleteMany = vi.fn()
const getDbForWorkspace = vi.fn()

vi.mock('@/config/prisma', () => ({
  prisma: {
    globalEmailReservation: {
      findUnique: (...args: any[]) => findUnique(...args),
      findMany: (...args: any[]) => findMany(...args),
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
      expiresAt: null,
    })
    const { findIdentityByEmail } = await import('@/identity/email-reservation.service')
    await expect(findIdentityByEmail('a@b.com')).resolves.toEqual({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'shard_2',
      status: 'ACTIVE',
      expiresAt: null,
    })
  })

  it('marks RELEASE_PENDING before delete and aborts when control plane is down', async () => {
    updateMany.mockRejectedValue(new Error('control plane down'))

    const { markReleasePendingBeforeDelete } = await import('@/identity/email-reservation.service')
    await expect(markReleasePendingBeforeDelete('a@b.com', 'u1')).rejects.toMatchObject({
      name: 'DependencyUnavailableError',
      extensions: expect.objectContaining({ code: 'IDENTITY_RELEASE_MARK_FAILED' }),
    })
  })

  it('marks ACTIVE as RELEASE_PENDING before shard deletion', async () => {
    updateMany.mockResolvedValue({ count: 1 })

    const { markReleasePendingBeforeDelete } = await import('@/identity/email-reservation.service')
    await markReleasePendingBeforeDelete('a@b.com', 'u1')
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: 'a@b.com',
          userId: 'u1',
        }),
        data: expect.objectContaining({ status: 'RELEASE_PENDING' }),
      })
    )
  })

  it('finalize deletes RELEASE_PENDING; failure leaves discoverable pending state', async () => {
    deleteMany.mockRejectedValue(new Error('control plane down'))

    const { finalizeReleaseAfterUserDelete } = await import(
      '@/identity/email-reservation.service'
    )
    await expect(finalizeReleaseAfterUserDelete('a@b.com', 'u1')).rejects.toMatchObject({
      name: 'DependencyUnavailableError',
      extensions: expect.objectContaining({ code: 'IDENTITY_RELEASE_PENDING' }),
    })
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        email: 'a@b.com',
        userId: 'u1',
        status: 'RELEASE_PENDING',
      },
    })
  })

  it('cleans RELEASE_PENDING when the shard user is missing', async () => {
    findUnique.mockResolvedValue({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'shard_2',
      status: 'RELEASE_PENDING',
    })
    getDbForWorkspace.mockReturnValue({ user: { findFirst } })
    findFirst.mockResolvedValue(null)
    deleteMany.mockResolvedValue({ count: 1 })

    const { reconcileReleasePending } = await import('@/identity/email-reservation.service')
    await expect(reconcileReleasePending('a@b.com', 'u1')).resolves.toBe('released')
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        email: 'a@b.com',
        userId: 'u1',
        status: 'RELEASE_PENDING',
      },
    })
  })

  it('restores ACTIVE when RELEASE_PENDING but shard user still exists', async () => {
    findUnique.mockResolvedValue({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'shard_2',
      status: 'RELEASE_PENDING',
    })
    getDbForWorkspace.mockReturnValue({ user: { findFirst } })
    findFirst.mockResolvedValue({ id: 'u1' })
    updateMany.mockResolvedValue({ count: 1 })

    const { reconcileReleasePending } = await import('@/identity/email-reservation.service')
    await expect(reconcileReleasePending('a@b.com', 'u1')).resolves.toBe('restored')
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACTIVE' }),
      })
    )
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it('never deletes ACTIVE when the shard user still exists', async () => {
    findUnique.mockResolvedValue({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'shard_2',
      status: 'ACTIVE',
    })
    getDbForWorkspace.mockReturnValue({ user: { findFirst } })
    findFirst.mockResolvedValue({ id: 'u1' })

    const { reconcileReleasePending } = await import('@/identity/email-reservation.service')
    await expect(reconcileReleasePending('a@b.com', 'u1')).resolves.toBe('kept')
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it('may clean ACTIVE after confirming the shard user is missing', async () => {
    findUnique.mockResolvedValue({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'shard_2',
      status: 'ACTIVE',
    })
    getDbForWorkspace.mockReturnValue({ user: { findFirst } })
    findFirst.mockResolvedValue(null)
    deleteMany.mockResolvedValue({ count: 1 })

    const { reconcileReleasePending } = await import('@/identity/email-reservation.service')
    await expect(reconcileReleasePending('a@b.com', 'u1')).resolves.toBe('released')
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        email: 'a@b.com',
        userId: 'u1',
        status: 'ACTIVE',
      },
    })
  })

  it('preserves identity when recorded shard is unavailable', async () => {
    findUnique.mockResolvedValue({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'missing',
      status: 'RELEASE_PENDING',
    })
    getDbForWorkspace.mockImplementation(() => {
      throw new Error('shard down')
    })

    const { reconcileReleasePending } = await import('@/identity/email-reservation.service')
    await expect(reconcileReleasePending('a@b.com', 'u1')).rejects.toMatchObject({
      name: 'DependencyUnavailableError',
    })
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it('cleanup is idempotent when the row is already gone', async () => {
    findUnique.mockResolvedValue(null)

    const { reconcileReleasePending } = await import('@/identity/email-reservation.service')
    await expect(reconcileReleasePending('a@b.com', 'u1')).resolves.toBe('kept')
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it('batch reconcile discovers RELEASE_PENDING recovery state', async () => {
    findMany.mockResolvedValue([{ email: 'a@b.com', userId: 'u1' }])
    findUnique.mockResolvedValue({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'shard_2',
      status: 'RELEASE_PENDING',
    })
    getDbForWorkspace.mockReturnValue({ user: { findFirst } })
    findFirst.mockResolvedValue(null)
    deleteMany.mockResolvedValue({ count: 1 })

    const { reconcileAllReleasePending } = await import('@/identity/email-reservation.service')
    await expect(reconcileAllReleasePending()).resolves.toEqual({
      released: 1,
      kept: 0,
      restored: 0,
      errors: 0,
    })
    expect(findMany).toHaveBeenCalledWith({
      where: { status: 'RELEASE_PENDING' },
      select: { email: true, userId: true },
    })
  })
})
