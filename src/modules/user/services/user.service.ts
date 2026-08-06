import type { PrismaClient } from '@prisma/client'
import { ValidationError, ConflictError, mapPrismaError } from '@/errors'
import { cache } from '@/cache'
import { toGraphqlPermissions } from '@/authorization/graphqlPermissions'
import type { PermissionId } from '@/authorization/permissions'

export function validateProfileUpdate(data: {
  username?: string | null
  avatar?: string | null
}) {
  const updates: { username?: string; avatar?: string | null } = {}

  if (data.username !== undefined) {
    if (data.username === null) {
      throw new ValidationError('Username cannot be null')
    }
    const username = data.username.trim()
    if (username.length < 2 || username.length > 64) {
      throw new ValidationError('Username must be between 2 and 64 characters')
    }
    updates.username = username
  }

  if (data.avatar !== undefined) {
    // Allow clearing avatar with null or empty string
    updates.avatar = data.avatar === '' ? null : data.avatar
  }

  if (Object.keys(updates).length === 0) {
    throw new ValidationError('No valid fields provided to update')
  }

  return updates
}

export async function updateProfile(
  client: PrismaClient,
  userId: string,
  workspaceId: string,
  data: { username?: string | null; avatar?: string | null },
  permissions: PermissionId[]
) {
  const updates = validateProfileUpdate(data)

  // Ensure the user still belongs to this workspace
  const existing = await client.user.findFirst({
    where: { id: userId, workspaceId },
    select: { id: true },
  })
  if (!existing) {
    throw new ValidationError('User not found in workspace')
  }

  try {
    const updated = await client.user.update({
      where: { id: userId },
      data: updates,
    })
    await cache.invalidateUser(userId)
    const { password: _p, ...rest } = updated
    return {
      ...rest,
      permissions: toGraphqlPermissions(permissions),
    }
  } catch (error) {
    const mapped = mapPrismaError(error)
    if (mapped) {
      if (mapped instanceof ConflictError) {
        throw new ConflictError('Username is already taken in this workspace')
      }
      throw mapped
    }
    throw error
  }
}
