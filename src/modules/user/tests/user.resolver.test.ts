import { userResolver } from '../resolvers/user.resolver'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Permission, UserType } from '@prisma/client'
import { Context } from '@/types/context.type'
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended'
import { AuthenticationError } from '@/errors'

vi.mock('@/cache', () => ({
  cache: { invalidateUser: vi.fn() },
}))

describe('User Resolver', () => {
  let mockContext: DeepMockProxy<Context>

  beforeEach(() => {
    mockContext = mockDeep<Context>()
    vi.clearAllMocks()
  })

  describe('Query.me', () => {
    it('Get user', async () => {
      const mockDbUser = {
        id: '1',
        email: 'test@example.com',
        username: 'Test User',
        userType: UserType.EMPLOYEE,
        roles: [{ permissions: [Permission.USER_VIEW] }],
        customPermissions: [Permission.ROLE_VIEW],
      }

      mockContext.user = { id: '1' } as any
      mockContext.isAuthenticated = true
      mockContext.client.user.findUnique.mockResolvedValue(mockDbUser as any)

      const result = await (userResolver.Query?.me as any)({}, {}, mockContext, {})

      expect(mockContext.client.user.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: { roles: true },
      })
      expect(result.id).toBe('1')
      expect(result.email).toBe('test@example.com')
      // Merged + deduplicated permissions from roles and customPermissions
      expect(result.permissions.sort()).toEqual(
        [Permission.USER_VIEW, Permission.ROLE_VIEW].sort()
      )
    })

    it('Get user (Unauthenticated)', async () => {
      mockContext.user = undefined as any
      mockContext.isAuthenticated = false

      await expect(
        (userResolver.Query?.me as any)({}, {}, mockContext, {})
      ).rejects.toThrow(AuthenticationError)
    })
  })

  describe('Mutation.updateUserProfile', () => {
    it('Update user profile fields successfully', async () => {
      mockContext.user = { id: '1' } as any
      mockContext.isAuthenticated = true

      const mockUpdatedUser = {
        id: '1',
        username: 'New Name',
        avatar: 'new-avatar.png',
        userType: UserType.OWNER,
      }
      mockContext.client.user.update.mockResolvedValue(mockUpdatedUser as any)

      const result = await (userResolver.Mutation?.updateUserProfile as any)(
        {},
        { data: { username: 'New Name', avatar: 'new-avatar.png' } },
        mockContext,
        {}
      )

      expect(mockContext.client.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { username: 'New Name', avatar: 'new-avatar.png' },
      })
      expect(result.username).toBe('New Name')
    })
  })
})
