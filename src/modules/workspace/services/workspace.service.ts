import { UserType, UserStatus, type PrismaClient } from '@prisma/client'
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
  mapPrismaError,
} from '@/errors'
import { slugify } from '@/utils/slug.util'
import { cache } from '@/cache'

const RESERVED_SLUGS = new Set(['admin', 'api', 'www', 'app', 'null', 'undefined'])

export function validateWorkspaceName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length < 2 || trimmed.length > 100) {
    throw new ValidationError('Workspace name must be between 2 and 100 characters')
  }
  return trimmed
}

export function validateWorkspaceSlug(raw: string): string {
  const slug = slugify(raw)
  if (!slug || slug.length < 2) {
    throw new ValidationError('Workspace slug is invalid or empty')
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new ValidationError('This workspace slug is reserved')
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new ValidationError('Workspace slug has an invalid format')
  }
  return slug
}

export async function getWorkspace(client: PrismaClient, workspaceId: string) {
  const workspace = await client.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) throw new NotFoundError('Workspace not found')
  return workspace
}

export async function updateWorkspace(
  client: PrismaClient,
  workspaceId: string,
  data: { name?: string | null; slug?: string | null }
) {
  const updates: { name?: string; slug?: string } = {}

  if (data.name !== undefined && data.name !== null) {
    updates.name = validateWorkspaceName(data.name)
  }
  if (data.slug !== undefined && data.slug !== null) {
    const nextSlug = validateWorkspaceSlug(data.slug)
    const clash = await client.workspace.findFirst({
      where: { slug: nextSlug, NOT: { id: workspaceId } },
    })
    if (clash) throw new ConflictError('Workspace slug already in use')
    updates.slug = nextSlug
  }

  if (Object.keys(updates).length === 0) {
    throw new ValidationError('No valid fields provided to update')
  }

  try {
    return await client.workspace.update({
      where: { id: workspaceId },
      data: updates,
    })
  } catch (error) {
    const mapped = mapPrismaError(error)
    if (mapped) throw mapped
    throw error
  }
}

/**
 * Transactional ownership transfer.
 * Current caller must be OWNER. Target must be an ACTIVE MEMBER in the same workspace.
 */
export async function transferOwnership(
  client: PrismaClient,
  workspaceId: string,
  currentOwnerId: string,
  newOwnerUserId: string
) {
  if (newOwnerUserId === currentOwnerId) {
    throw new ValidationError('New owner must be a different user')
  }

  try {
    const workspace = await client.$transaction(async (tx) => {
      const current = await tx.workspace.findUnique({ where: { id: workspaceId } })
      if (!current) throw new NotFoundError('Workspace not found')
      if (current.ownerId !== currentOwnerId) {
        throw new AuthorizationError('Only the workspace owner can transfer ownership')
      }

      const newOwner = await tx.user.findFirst({
        where: { id: newOwnerUserId, workspaceId },
      })
      if (!newOwner) throw new NotFoundError('Target user not found in this workspace')
      if (newOwner.status !== UserStatus.ACTIVE) {
        throw new ValidationError('New owner must be an active user')
      }
      if (newOwner.userType === UserType.OWNER) {
        throw new ValidationError('Target user is already the owner')
      }

      // Demote current owner then promote new owner, then set workspace.ownerId
      await tx.user.update({
        where: { id: currentOwnerId },
        data: { userType: UserType.MEMBER },
      })

      await tx.user.update({
        where: { id: newOwnerUserId },
        data: { userType: UserType.OWNER },
      })

      return tx.workspace.update({
        where: { id: workspaceId },
        data: { ownerId: newOwnerUserId },
      })
    })

    await cache.invalidateUsers([currentOwnerId, newOwnerUserId])
    return workspace
  } catch (error) {
    const mapped = mapPrismaError(error)
    if (mapped) throw mapped
    throw error
  }
}
