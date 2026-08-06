import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DependencyUnavailableError } from '@/errors'

const getEmailReservation = vi.fn()
const activateEmailReservation = vi.fn()
const reconcileExpiredPendingReservation = vi.fn()
const getDbForWorkspace = vi.fn()
const findUserAcrossShards = vi.fn()
const findUnique = vi.fn()

vi.mock('@/identity/email-reservation.service', () => ({
  getEmailReservation: (...args: any[]) => getEmailReservation(...args),
  activateEmailReservation: (...args: any[]) => activateEmailReservation(...args),
  reconcileExpiredPendingReservation: (...args: any[]) =>
    reconcileExpiredPendingReservation(...args),
}))

vi.mock('@/config/prisma', () => ({
  getDbForWorkspace: (...args: any[]) => getDbForWorkspace(...args),
  findUserAcrossShards: (...args: any[]) => findUserAcrossShards(...args),
}))

vi.mock('@/config/logger', () => ({
  logDependencyFailure: vi.fn(),
}))

describe('resolveUserByEmail', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('uses legacy scan only when no control-plane reservation exists', async () => {
    getEmailReservation.mockResolvedValue(null)
    findUserAcrossShards.mockResolvedValue({
      result: { id: 'u1', email: 'a@b.com' },
      client: {},
      shardId: 'shard_1',
    })

    const { resolveUserByEmail } = await import('@/identity/resolve-user-by-email')
    const result = await resolveUserByEmail('a@b.com')

    expect(findUserAcrossShards).toHaveBeenCalled()
    expect(getDbForWorkspace).not.toHaveBeenCalled()
    expect(result.result?.id).toBe('u1')
  })

  it('returns the user from exactly the persisted ACTIVE shard', async () => {
    getEmailReservation.mockResolvedValue({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'shard_2',
      status: 'ACTIVE',
    })
    const client = { user: { findUnique } }
    getDbForWorkspace.mockReturnValue(client)
    findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      workspaceId: 'ws-1',
    })

    const { resolveUserByEmail } = await import('@/identity/resolve-user-by-email')
    const result = await resolveUserByEmail('a@b.com')

    expect(getDbForWorkspace).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      shardId: 'shard_2',
    })
    expect(findUserAcrossShards).not.toHaveBeenCalled()
    expect(result.shardId).toBe('shard_2')
    expect(result.result?.id).toBe('u1')
  })

  it('does not scan other shards when ACTIVE shard is unavailable', async () => {
    getEmailReservation.mockResolvedValue({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'missing',
      status: 'ACTIVE',
    })
    getDbForWorkspace.mockImplementation(() => {
      throw new DependencyUnavailableError('Workspace shard is unavailable or misconfigured', {
        extensions: { shardId: 'missing', workspaceId: 'ws-1' },
      })
    })

    const { resolveUserByEmail } = await import('@/identity/resolve-user-by-email')
    await expect(resolveUserByEmail('a@b.com')).rejects.toMatchObject({
      name: 'DependencyUnavailableError',
    })
    expect(findUserAcrossShards).not.toHaveBeenCalled()
  })

  it('does not scan other shards when ACTIVE identity user is missing', async () => {
    getEmailReservation.mockResolvedValue({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'shard_2',
      status: 'ACTIVE',
    })
    getDbForWorkspace.mockReturnValue({ user: { findUnique } })
    findUnique.mockResolvedValue(null)

    const { resolveUserByEmail } = await import('@/identity/resolve-user-by-email')
    await expect(resolveUserByEmail('a@b.com')).rejects.toMatchObject({
      name: 'DependencyUnavailableError',
      extensions: expect.objectContaining({ code: 'IDENTITY_INTEGRITY_ERROR' }),
    })
    expect(findUserAcrossShards).not.toHaveBeenCalled()
  })

  it('PENDING never invokes findUserAcrossShards; activates when shard user exists', async () => {
    getEmailReservation.mockResolvedValue({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'shard_2',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
    })
    getDbForWorkspace.mockReturnValue({ user: { findUnique } })
    findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      workspaceId: 'ws-1',
    })
    activateEmailReservation.mockResolvedValue(undefined)

    const { resolveUserByEmail } = await import('@/identity/resolve-user-by-email')
    const result = await resolveUserByEmail('a@b.com')

    expect(activateEmailReservation).toHaveBeenCalledWith('a@b.com', 'u1')
    expect(findUserAcrossShards).not.toHaveBeenCalled()
    expect(result.result?.id).toBe('u1')
  })

  it('PENDING without shard user returns conflict and does not scan', async () => {
    getEmailReservation.mockResolvedValue({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'shard_2',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
    })
    getDbForWorkspace.mockReturnValue({ user: { findUnique } })
    findUnique.mockResolvedValue(null)

    const { resolveUserByEmail } = await import('@/identity/resolve-user-by-email')
    await expect(resolveUserByEmail('a@b.com')).rejects.toMatchObject({
      name: 'ConflictError',
      message: 'Email reservation is pending and the account is not ready',
    })
    expect(findUserAcrossShards).not.toHaveBeenCalled()
  })

  it('RELEASE_PENDING blocks auth and never scans shards', async () => {
    getEmailReservation.mockResolvedValue({
      email: 'a@b.com',
      userId: 'u1',
      workspaceId: 'ws-1',
      shardId: 'shard_2',
      status: 'RELEASE_PENDING',
    })

    const { resolveUserByEmail } = await import('@/identity/resolve-user-by-email')
    await expect(resolveUserByEmail('a@b.com')).rejects.toMatchObject({
      name: 'DependencyUnavailableError',
      extensions: expect.objectContaining({ code: 'IDENTITY_RELEASE_PENDING' }),
    })
    expect(findUserAcrossShards).not.toHaveBeenCalled()
    expect(getDbForWorkspace).not.toHaveBeenCalled()
  })
})
