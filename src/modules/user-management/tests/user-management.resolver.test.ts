import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Permission, UserType } from '@prisma/client'
import { userManagementResolver } from '../resolvers/user-management.resolver'
import { Context } from '@/types/context.type'
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended'
import { NotFoundError, ValidationError } from '@/errors'
import * as AuthUtils from '@/modules/auth/utils/auth.utils'
import { cache } from '@/cache'

vi.mock('@/modules/auth/utils/auth.utils', () => ({
  hashPassword: vi.fn(),
}))

vi.mock('@/cache', () => ({
  cache: { invalidateUser: vi.fn() },
}))

describe('UserManagement Resolver', () => {
  let mockContext: DeepMockProxy<Context>

  beforeEach(() => {
    mockContext = mockDeep<Context>()
    vi.clearAllMocks()
    mockContext.isAuthenticated = true
    mockContext.userType = UserType.OWNER
    mockContext.user = { id: 'owner-1', userType: UserType.OWNER } as any
    mockContext.permissions = []
  })

  describe('Query.getUsers', () => {
    it('should return paginated users for owner', async () => {
      const mockUsers = [{ id: 'u1', username: 'emp1', userType: UserType.EMPLOYEE, roles: [] }]
      mockContext.client.user.findMany.mockResolvedValue(mockUsers as any)
      mockContext.client.user.count.mockResolvedValue(1)

      const result = await (userManagementResolver.Query?.getUsers as any)(
        {},
        { pagination: { page: 1, limit: 10 } },
        mockContext,
        {}
      )

      expect(result.items).toEqual(mockUsers)
      expect(result.pageInfo.totalItems).toBe(1)
      expect(result.pageInfo.totalPages).toBe(1)
    })
  })

  describe('Mutation.createUser', () => {
    it('should create a sub-user successfully with typed permissions', async () => {
      const data = {
        email: 'emp@test.com',
        username: 'emp',
        password: 'pass123',
        userType: UserType.EMPLOYEE,
        roleIds: [],
        customPermissions: [Permission.USER_VIEW],
      }
      const created = {
        id: 'u1',
        ...data,
        password: 'hashed',
        ownerId: 'owner-1',
        roles: [],
      }

      vi.mocked(AuthUtils.hashPassword).mockResolvedValue('hashed')
      mockContext.client.user.findFirst.mockResolvedValue(null)
      mockContext.client.user.create.mockResolvedValue(created as any)

      const result = await (userManagementResolver.Mutation?.createUser as any)(
        {},
        { data },
        mockContext,
        {}
      )

      expect(mockContext.client.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userType: UserType.EMPLOYEE,
            customPermissions: [Permission.USER_VIEW],
          }),
        })
      )
      expect(result.email).toBe('emp@test.com')
      expect((result as any).password).toBeUndefined()
    })

    it('should throw if trying to create an OWNER', async () => {
      const data = {
        email: 'x@x.com',
        username: 'x',
        password: 'p',
        userType: UserType.OWNER,
      }

      await expect(
        (userManagementResolver.Mutation?.createUser as any)({}, { data }, mockContext, {})
      ).rejects.toThrow(ValidationError)
    })

    it('should throw if user already exists', async () => {
      const data = {
        email: 'dup@test.com',
        username: 'dup',
        password: 'p',
        userType: UserType.EMPLOYEE,
      }
      mockContext.client.user.findFirst.mockResolvedValue({ id: 'u1' } as any)

      await expect(
        (userManagementResolver.Mutation?.createUser as any)({}, { data }, mockContext, {})
      ).rejects.toThrow(ValidationError)
    })
  })

  describe('Mutation.deleteUser', () => {
    it('should delete a user successfully', async () => {
      mockContext.client.user.findFirst.mockResolvedValue({ id: 'u1' } as any)
      mockContext.client.user.delete.mockResolvedValue({} as any)

      const result = await (userManagementResolver.Mutation?.deleteUser as any)(
        {},
        { id: 'u1' },
        mockContext,
        {}
      )

      expect(result).toBe(true)
      expect(cache.invalidateUser).toHaveBeenCalledWith('u1')
    })

    it('should throw if user not found', async () => {
      mockContext.client.user.findFirst.mockResolvedValue(null)

      await expect(
        (userManagementResolver.Mutation?.deleteUser as any)({}, { id: 'u1' }, mockContext, {})
      ).rejects.toThrow(NotFoundError)
    })
  })

  describe('Mutation.assignRolesToUser', () => {
    it('should assign roles to a user', async () => {
      const updatedUser = {
        id: 'u1',
        roles: [{ id: 'r1', name: 'Admin', permissions: [Permission.USER_VIEW] }],
        password: 'x',
      }
      mockContext.client.user.findFirst.mockResolvedValue({ id: 'u1' } as any)
      mockContext.client.role.findMany.mockResolvedValue([{ id: 'r1' }] as any)
      mockContext.client.user.update.mockResolvedValue(updatedUser as any)

      const result = await (userManagementResolver.Mutation?.assignRolesToUser as any)(
        {},
        { userId: 'u1', roleIds: ['r1'] },
        mockContext,
        {}
      )

      expect(mockContext.client.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({ roles: { connect: [{ id: 'r1' }] } }),
        })
      )
      expect(cache.invalidateUser).toHaveBeenCalledWith('u1')
    })
  })
})
