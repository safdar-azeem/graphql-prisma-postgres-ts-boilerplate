import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Permission, UserType } from '@prisma/client'
import { roleResolver } from '../resolvers/role.resolver'
import { Context } from '@/types/context.type'
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended'
import { NotFoundError, ValidationError } from '@/errors'

describe('Role Resolver', () => {
  let mockContext: DeepMockProxy<Context>

  beforeEach(() => {
    mockContext = mockDeep<Context>()
    vi.clearAllMocks()
    mockContext.isAuthenticated = true
    mockContext.userType = UserType.OWNER
    mockContext.user = { id: 'owner-1', userType: UserType.OWNER } as any
    mockContext.permissions = []
  })

  describe('Query.getRoles', () => {
    it('should return roles for owner', async () => {
      const mockRoles = [
        { id: 'r1', name: 'Admin', ownerId: 'owner-1', permissions: [Permission.USER_VIEW] },
      ]
      mockContext.client.role.findMany.mockResolvedValue(mockRoles as any)

      const result = await (roleResolver.Query?.getRoles as any)({}, {}, mockContext, {})

      expect(mockContext.client.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ownerId: 'owner-1' } })
      )
      expect(result).toEqual(mockRoles)
    })
  })

  describe('Mutation.createRole', () => {
    it('should create a role with valid permissions', async () => {
      const data = { name: 'Manager', permissions: [Permission.USER_VIEW, Permission.USER_CREATE] }
      const created = { id: 'r2', ...data, ownerId: 'owner-1' }

      mockContext.client.role.findFirst.mockResolvedValue(null)
      mockContext.client.role.create.mockResolvedValue(created as any)

      const result = await (roleResolver.Mutation?.createRole as any)(
        {},
        { data },
        mockContext,
        {}
      )

      expect(mockContext.client.role.create).toHaveBeenCalledWith({
        data: {
          name: 'Manager',
          permissions: [Permission.USER_VIEW, Permission.USER_CREATE],
          ownerId: 'owner-1',
        },
      })
      expect(result).toEqual(created)
    })

    it('should throw ValidationError for invalid permission string', async () => {
      const data = { name: 'Bad Role', permissions: ['INVALID_PERM'] }
      mockContext.client.role.findFirst.mockResolvedValue(null)

      await expect(
        (roleResolver.Mutation?.createRole as any)({}, { data }, mockContext, {})
      ).rejects.toThrow(ValidationError)
    })

    it('should throw if role name already exists', async () => {
      const data = { name: 'Admin', permissions: [Permission.USER_VIEW] }
      mockContext.client.role.findFirst.mockResolvedValue({ id: 'r1' } as any)

      await expect(
        (roleResolver.Mutation?.createRole as any)({}, { data }, mockContext, {})
      ).rejects.toThrow(ValidationError)
    })
  })

  describe('Mutation.deleteRole', () => {
    it('should delete a role', async () => {
      mockContext.client.role.findFirst.mockResolvedValue({ id: 'r1' } as any)
      mockContext.client.role.delete.mockResolvedValue({} as any)

      const result = await (roleResolver.Mutation?.deleteRole as any)(
        {},
        { id: 'r1' },
        mockContext,
        {}
      )
      expect(result).toBe(true)
    })

    it('should throw if role not found', async () => {
      mockContext.client.role.findFirst.mockResolvedValue(null)

      await expect(
        (roleResolver.Mutation?.deleteRole as any)({}, { id: 'r1' }, mockContext, {})
      ).rejects.toThrow(NotFoundError)
    })
  })
})
