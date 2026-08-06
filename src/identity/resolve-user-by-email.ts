import { getDbForWorkspace, findUserAcrossShards } from '@/config/prisma'
import { logDependencyFailure } from '@/config/logger'
import { DependencyUnavailableError } from '@/errors'
import { findIdentityByEmail } from './email-reservation.service'

/**
 * Resolve a user by email.
 * - No ACTIVE identity → legacy cross-shard scan (backfill gap only).
 * - ACTIVE identity → exactly the recorded shard; never silent fallback.
 */
export async function resolveUserByEmail(email: string) {
  const identity = await findIdentityByEmail(email)

  if (!identity) {
    return findUserAcrossShards((c) => c.user.findUnique({ where: { email } }))
  }

  let client
  try {
    client = getDbForWorkspace({
      workspaceId: identity.workspaceId,
      shardId: identity.shardId,
    })
  } catch (error) {
    logDependencyFailure({
      dependency: 'identity-routing',
      operation: 'resolve-shard',
      error,
    })
    if (error instanceof DependencyUnavailableError) throw error
    throw new DependencyUnavailableError('Identity shard is unavailable', {
      originalError: error instanceof Error ? error : undefined,
      extensions: {
        userId: identity.userId,
        workspaceId: identity.workspaceId,
        shardId: identity.shardId,
      },
    })
  }

  let user
  try {
    user = await client.user.findUnique({ where: { email } })
  } catch (error) {
    throw new DependencyUnavailableError('Failed to load user from identity shard', {
      originalError: error instanceof Error ? error : undefined,
      extensions: {
        userId: identity.userId,
        workspaceId: identity.workspaceId,
        shardId: identity.shardId,
      },
    })
  }

  if (
    !user ||
    user.id !== identity.userId ||
    user.workspaceId !== identity.workspaceId
  ) {
    logDependencyFailure({
      dependency: 'identity-directory',
      operation: 'integrity-missing-user',
      error: new Error('ACTIVE identity has no matching shard user'),
    })
    throw new DependencyUnavailableError(
      'Identity directory is inconsistent with shard data',
      {
        extensions: {
          userId: identity.userId,
          workspaceId: identity.workspaceId,
          shardId: identity.shardId,
          code: 'IDENTITY_INTEGRITY_ERROR',
        },
      }
    )
  }

  return { result: user, client, shardId: identity.shardId }
}
