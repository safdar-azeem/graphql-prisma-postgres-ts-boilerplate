import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UserType, UserStatus, WorkspaceStatus } from '@prisma/client'
import { userResolver } from '../resolvers/user.resolver'
import { Context } from '@/types/context.type'
import { PERMISSIONS } from '@/authorization/permissions'

vi.mock('@/cache', () => ({
  cache: { invalidateUser: vi.fn().mockResolvedValue(undefined) },
}))

describe('User Resolver', () => {
  let context: Context
  let client: any

  beforeEach(() => {
    client = {
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: 'u1', workspaceId: 'ws-1' }),
        update: vi.fn(),
      },
    }
    context = {
      user: {
        id: 'u1',
        email: 'a@b.com',
        username: 'alice',
        userType: UserType.MEMBER,
        status: UserStatus.ACTIVE,
        workspaceId: 'ws-1',
        customPermissions: [],
      } as any,
      isAuthenticated: true,
      is2faPending: false,
      client,
      workspaceId: 'ws-1',
      workspaceStatus: WorkspaceStatus.ACTIVE,
      userType: UserType.MEMBER,
      permissions: [PERMISSIONS.USERS_READ],
      userStatus: UserStatus.ACTIVE,
    }
  })

  it('me returns graphql permission names without password', async () => {
    const result = await (userResolver.Query?.me as any)({}, {}, context, {})
    expect(result.permissions).toContain('USERS_READ')
    expect(result.password).toBeUndefined()
  })

  it('updateUserProfile updates allowed fields', async () => {
    client.user.update.mockResolvedValue({
      id: 'u1',
      username: 'bob',
      avatar: null,
      password: 'secret',
    })

    const result = await (userResolver.Mutation?.updateUserProfile as any)(
      {},
      { data: { username: 'bob' } },
      context,
      {}
    )

    expect(client.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'u1', workspaceId: 'ws-1' },
      select: { id: true },
    })
    expect(result.username).toBe('bob')
    expect(result.password).toBeUndefined()
  })

  it('clears avatar when null is provided', async () => {
    client.user.update.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      avatar: null,
      password: 'secret',
    })

    const result = await (userResolver.Mutation?.updateUserProfile as any)(
      {},
      { data: { avatar: null } },
      context,
      {}
    )

    expect(client.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ avatar: null }),
      })
    )
    expect(result.avatar).toBeNull()
  })
})
