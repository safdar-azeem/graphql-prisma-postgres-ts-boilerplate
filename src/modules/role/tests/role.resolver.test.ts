import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ValidationError } from '@/errors'
import * as RoleService from '../services/role.service'

describe('Role Service', () => {
  let client: any

  beforeEach(() => {
    client = {
      role: {
        findMany: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    }
    vi.clearAllMocks()
  })

  it('lists roles with pagination and maps permissions', async () => {
    client.role.findMany.mockResolvedValue([
      {
        id: 'r1',
        name: 'Editor',
        permissions: ['users.read'],
        workspaceId: 'ws-1',
        isSystem: false,
      },
    ])
    client.role.count.mockResolvedValue(1)

    const result = await RoleService.listRoles(client, 'ws-1', { pagination: { page: 1, limit: 10 } })

    expect(result.pageInfo.totalItems).toBe(1)
    expect(result.items[0].permissions).toContain('USERS_READ')
  })

  it('rejects invalid permissions', async () => {
    await expect(
      RoleService.createRole(client, 'ws-1', {
        name: 'Bad',
        permissions: ['not.a.permission'],
      })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('blocks deleting system roles', async () => {
    client.role.findFirst.mockResolvedValue({
      id: 'r1',
      name: 'Admin',
      isSystem: true,
      workspaceId: 'ws-1',
      permissions: [],
    })

    await expect(RoleService.deleteRole(client, 'ws-1', 'r1')).rejects.toBeInstanceOf(
      ValidationError
    )
  })
})
