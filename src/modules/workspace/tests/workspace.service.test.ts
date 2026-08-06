import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UserType, UserStatus } from '@prisma/client'
import { ValidationError, AuthorizationError } from '@/errors'
import * as WorkspaceService from '../services/workspace.service'

vi.mock('@/cache', () => ({
  cache: { invalidateUsers: vi.fn() },
}))

describe('Workspace Service', () => {
  let client: any

  beforeEach(() => {
    client = {
      workspace: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (fn: any) => fn(client)),
    }
    vi.clearAllMocks()
  })

  it('transfers ownership transactionally', async () => {
    client.workspace.findUnique.mockResolvedValue({
      id: 'ws-1',
      ownerId: 'owner-1',
    })
    client.user.findFirst.mockResolvedValue({
      id: 'member-1',
      status: UserStatus.ACTIVE,
      userType: UserType.MEMBER,
      workspaceId: 'ws-1',
    })
    client.workspace.update.mockResolvedValue({
      id: 'ws-1',
      ownerId: 'member-1',
    })

    const result = await WorkspaceService.transferOwnership(
      client,
      'ws-1',
      'owner-1',
      'member-1'
    )

    expect(client.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'owner-1' },
        data: { userType: UserType.MEMBER },
      })
    )
    expect(client.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'member-1' },
        data: { userType: UserType.OWNER },
      })
    )
    expect(result.ownerId).toBe('member-1')
  })

  it('rejects transfer to self', async () => {
    await expect(
      WorkspaceService.transferOwnership(client, 'ws-1', 'owner-1', 'owner-1')
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects transfer when caller is not owner', async () => {
    client.workspace.findUnique.mockResolvedValue({
      id: 'ws-1',
      ownerId: 'owner-1',
    })

    await expect(
      WorkspaceService.transferOwnership(client, 'ws-1', 'intruder', 'member-1')
    ).rejects.toBeInstanceOf(AuthorizationError)
  })
})
