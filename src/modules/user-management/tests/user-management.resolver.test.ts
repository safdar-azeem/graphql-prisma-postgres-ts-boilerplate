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
  cache: { invalidateUser: vi.fn() },
}))

vi.mock('@/identity/email-reservation.service', () => ({
  reserveEmail: vi.fn().mockResolvedValue(undefined),
  activateEmailReservation: vi.fn().mockResolvedValue(undefined),
  releaseEmailReservation: vi.fn().mockResolvedValue(undefined),
  findIdentityByEmail: vi.fn().mockResolvedValue(null),
}))

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
})
