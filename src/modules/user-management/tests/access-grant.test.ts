import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthorizationError } from '@/errors'
import { PERMISSIONS } from '@/authorization/permissions'
import * as UserManagementService from '../services/user-management.service'
import * as AuthUtils from '@/modules/auth/utils/auth.utils'

vi.mock('@/modules/auth/utils/auth.utils', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed'),
}))

vi.mock('@/cache', () => ({
  cache: { invalidateUser: vi.fn() },
}))

vi.mock('@/identity/email-reservation.service', () => ({
  reserveEmail: vi.fn().mockResolvedValue(undefined),
  activateAfterShardCommit: vi.fn().mockResolvedValue(undefined),
  releaseAfterFailedShardWrite: vi.fn().mockResolvedValue(undefined),
  releaseAfterUserDelete: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/config/prisma', () => ({
  getDbForWorkspace: vi.fn(),
}))

import { getDbForWorkspace } from '@/config/prisma'

describe('Access grant restrictions', () => {
  let client: any
  const memberActor = {
    id: 'member-1',
    userType: 'MEMBER' as any,
    permissions: [PERMISSIONS.USERS_UPDATE, PERMISSIONS.USERS_MANAGE_ROLES],
  }

  beforeEach(() => {
    client = {
      user: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
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
  })

  it('blocks a member from assigning the Admin system role', async () => {
    client.user.findFirst.mockResolvedValue({
      id: 'target',
      userType: 'MEMBER',
      workspaceId: 'ws-1',
      roles: [],
    })
    client.role.findMany.mockResolvedValue([
      {
        id: 'admin-role',
        name: 'Admin',
        isSystem: true,
        permissions: [PERMISSIONS.USERS_MANAGE_ROLES],
        workspaceId: 'ws-1',
      },
    ])

    await expect(
      UserManagementService.setUserRoles(client, 'ws-1', memberActor, 'target', ['admin-role'])
    ).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('blocks a member from granting permissions they do not possess', async () => {
    const actor = {
      ...memberActor,
      permissions: [PERMISSIONS.USERS_MANAGE_PERMISSIONS, PERMISSIONS.USERS_READ],
    }
    client.user.findFirst.mockResolvedValue({
      id: 'target',
      userType: 'MEMBER',
      workspaceId: 'ws-1',
      roles: [],
    })

    await expect(
      UserManagementService.setUserPermissions(client, 'ws-1', actor, 'target', ['ROLES_CREATE'])
    ).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('blocks a member from modifying their own roles', async () => {
    await expect(
      UserManagementService.setUserRoles(client, 'ws-1', memberActor, 'member-1', ['role-1'])
    ).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('blocks createUser with Admin role for a non-owner', async () => {
    client.role.findMany.mockResolvedValue([
      {
        id: 'admin-role',
        name: 'Admin',
        isSystem: true,
        permissions: [...Object.values(PERMISSIONS)],
        workspaceId: 'ws-1',
      },
    ])

    await expect(
      UserManagementService.createUser(client, 'ws-1', memberActor, {
        email: 'new@example.com',
        username: 'newbie',
        password: 'password123',
        roleIds: ['admin-role'],
      })
    ).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('allows owner to assign Admin role', async () => {
    const ownerActor = {
      id: 'owner-1',
      userType: 'OWNER' as any,
      permissions: [],
    }
    client.user.findFirst.mockResolvedValue({
      id: 'target',
      userType: 'MEMBER',
      workspaceId: 'ws-1',
      roles: [],
    })
    client.role.findMany.mockResolvedValue([
      {
        id: 'admin-role',
        name: 'Admin',
        isSystem: true,
        permissions: [PERMISSIONS.USERS_READ],
        workspaceId: 'ws-1',
      },
    ])
    client.user.update.mockResolvedValue({
      id: 'target',
      userType: 'MEMBER',
      customPermissions: [],
      roles: [],
      password: 'x',
    })

    const result = await UserManagementService.setUserRoles(
      client,
      'ws-1',
      ownerActor,
      'target',
      ['admin-role']
    )
    expect(result.id).toBe('target')
  })
})
