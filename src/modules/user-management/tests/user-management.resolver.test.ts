import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ValidationError } from '@/errors'
import * as UserManagementService from '../services/user-management.service'
import * as AuthUtils from '@/modules/auth/utils/auth.utils'
import { PERMISSIONS } from '@/authorization/permissions'

const UserType = { OWNER: 'OWNER', MEMBER: 'MEMBER' } as const
const UserStatus = { ACTIVE: 'ACTIVE' } as const

vi.mock('@/modules/auth/utils/auth.utils', () => ({
  hashPassword: vi.fn(),
}))

vi.mock('@/cache', () => ({
  cache: {
    invalidateUser: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/identity/email-reservation.service', () => ({
  reserveEmail: vi.fn().mockResolvedValue(undefined),
  activateAfterShardCommit: vi.fn().mockResolvedValue(undefined),
  releaseAfterFailedShardWrite: vi.fn().mockResolvedValue(undefined),
  markReleasePendingBeforeDelete: vi.fn().mockResolvedValue(undefined),
  finalizeReleaseAfterUserDelete: vi.fn().mockResolvedValue(undefined),
  releaseAfterUserDelete: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/config/prisma', () => ({
  getDbForWorkspace: vi.fn(),
}))

import { getDbForWorkspace } from '@/config/prisma'
import * as EmailReservation from '@/identity/email-reservation.service'

describe('User Management Service', () => {
  let client: any
  const ownerActor = {
    id: 'owner-1',
    userType: UserType.OWNER as any,
    permissions: [],
  }

  beforeEach(() => {
    client = {
      user: {
        findMany: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      workspace: {
        findUnique: vi.fn().mockResolvedValue({ id: 'ws-1', shardId: 'shard_1' }),
      },
      role: {
        findMany: vi.fn(),
      },
    }
    vi.clearAllMocks()
    vi.mocked(getDbForWorkspace).mockImplementation(() => client)
    vi.mocked(EmailReservation.markReleasePendingBeforeDelete).mockResolvedValue(undefined)
    vi.mocked(EmailReservation.finalizeReleaseAfterUserDelete).mockResolvedValue(undefined)
  })

  it('lists members excluding owners', async () => {
    client.user.findMany.mockResolvedValue([
      {
        id: 'u1',
        username: 'member1',
        userType: UserType.MEMBER,
        customPermissions: [PERMISSIONS.USERS_READ],
        roles: [],
        password: 'x',
      },
    ])
    client.user.count.mockResolvedValue(1)

    const result = await UserManagementService.listUsers(client, 'ws-1', {})

    expect(client.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws-1',
          userType: { not: UserType.OWNER },
        }),
      })
    )
    expect(result.items[0].customPermissions).toContain('USERS_READ')
    expect((result.items[0] as any).password).toBeUndefined()
  })

  it('creates a MEMBER user with hashed password', async () => {
    vi.mocked(AuthUtils.hashPassword).mockResolvedValue('hashed')
    client.user.create.mockResolvedValue({
      id: 'u2',
      email: 'a@b.com',
      username: 'alice',
      password: 'hashed',
      userType: UserType.MEMBER,
      status: UserStatus.ACTIVE,
      workspaceId: 'ws-1',
      customPermissions: [],
      roles: [],
    })

    const result = await UserManagementService.createUser(client, 'ws-1', ownerActor, {
      email: 'a@b.com',
      username: 'alice',
      password: 'password123',
    })

    expect(AuthUtils.hashPassword).toHaveBeenCalledWith('password123')
    expect((result as any).password).toBeUndefined()
    expect(EmailReservation.activateAfterShardCommit).toHaveBeenCalled()
    expect(EmailReservation.releaseAfterFailedShardWrite).not.toHaveBeenCalled()
  })

  it('does not release reservation when activation fails after member create', async () => {
    vi.mocked(AuthUtils.hashPassword).mockResolvedValue('hashed')
    client.user.create.mockResolvedValue({
      id: 'u2',
      email: 'a@b.com',
      username: 'alice',
      password: 'hashed',
      userType: UserType.MEMBER,
      status: UserStatus.ACTIVE,
      workspaceId: 'ws-1',
      customPermissions: [],
      roles: [],
    })
    vi.mocked(EmailReservation.activateAfterShardCommit).mockRejectedValueOnce(
      new Error('Account was created but identity activation is pending')
    )

    await expect(
      UserManagementService.createUser(client, 'ws-1', ownerActor, {
        email: 'a@b.com',
        username: 'alice',
        password: 'password123',
      })
    ).rejects.toThrow(/identity activation is pending/i)

    expect(EmailReservation.releaseAfterFailedShardWrite).not.toHaveBeenCalled()
  })

  it('fails member creation when workspace has no persisted shardId', async () => {
    client.workspace.findUnique.mockResolvedValue({ id: 'ws-1', shardId: null })

    await expect(
      UserManagementService.createUser(client, 'ws-1', ownerActor, {
        email: 'a@b.com',
        username: 'alice',
        password: 'password123',
      })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects deleting the owner', async () => {
    client.user.findFirst.mockResolvedValue({
      id: 'owner',
      userType: UserType.OWNER,
      workspaceId: 'ws-1',
      roles: [],
    })

    await expect(UserManagementService.deleteUser(client, 'ws-1', 'owner')).rejects.toBeInstanceOf(
      ValidationError
    )
  })

  it('does not delete the shard user when control-plane release mark fails', async () => {
    const { DependencyUnavailableError } = await import('@/errors')

    client.user.findFirst.mockResolvedValue({
      id: 'member-1',
      email: 'm@b.com',
      userType: UserType.MEMBER,
      workspaceId: 'ws-1',
      roles: [],
    })
    vi.mocked(EmailReservation.markReleasePendingBeforeDelete).mockRejectedValue(
      new DependencyUnavailableError(
        'Cannot start user deletion; identity release marker could not be written',
        { extensions: { code: 'IDENTITY_RELEASE_MARK_FAILED' } }
      )
    )

    await expect(
      UserManagementService.deleteUser(client, 'ws-1', 'member-1')
    ).rejects.toMatchObject({
      name: 'DependencyUnavailableError',
      extensions: expect.objectContaining({ code: 'IDENTITY_RELEASE_MARK_FAILED' }),
    })
    expect(client.user.delete).not.toHaveBeenCalled()
    expect(EmailReservation.finalizeReleaseAfterUserDelete).not.toHaveBeenCalled()
  })

  it('does not finalize reservation when shard user deletion fails after mark', async () => {
    client.user.findFirst.mockResolvedValue({
      id: 'member-1',
      email: 'm@b.com',
      userType: UserType.MEMBER,
      workspaceId: 'ws-1',
      roles: [],
    })
    vi.mocked(EmailReservation.markReleasePendingBeforeDelete).mockResolvedValue(undefined)
    client.user.delete.mockRejectedValue(new Error('shard delete failed'))

    await expect(UserManagementService.deleteUser(client, 'ws-1', 'member-1')).rejects.toThrow(
      /shard delete failed/
    )
    expect(EmailReservation.markReleasePendingBeforeDelete).toHaveBeenCalled()
    expect(EmailReservation.finalizeReleaseAfterUserDelete).not.toHaveBeenCalled()
  })

  it('invalidates user cache when finalize release fails after delete', async () => {
    const { cache } = await import('@/cache')
    const { DependencyUnavailableError } = await import('@/errors')

    client.user.findFirst.mockResolvedValue({
      id: 'member-1',
      email: 'm@b.com',
      userType: UserType.MEMBER,
      workspaceId: 'ws-1',
      roles: [],
    })
    client.user.delete.mockResolvedValue({})
    vi.mocked(EmailReservation.markReleasePendingBeforeDelete).mockResolvedValue(undefined)
    vi.mocked(EmailReservation.finalizeReleaseAfterUserDelete).mockRejectedValue(
      new DependencyUnavailableError(
        'User was deleted but email reservation cleanup is pending; email is not yet reusable',
        { extensions: { code: 'IDENTITY_RELEASE_PENDING' } }
      )
    )

    await expect(
      UserManagementService.deleteUser(client, 'ws-1', 'member-1')
    ).rejects.toMatchObject({
      name: 'DependencyUnavailableError',
      extensions: expect.objectContaining({ code: 'IDENTITY_RELEASE_PENDING' }),
    })

    expect(EmailReservation.markReleasePendingBeforeDelete).toHaveBeenCalledWith(
      'm@b.com',
      'member-1'
    )
    expect(client.user.delete).toHaveBeenCalledWith({ where: { id: 'member-1' } })
    expect(cache.invalidateUser).toHaveBeenCalledWith('member-1')
  })
})
