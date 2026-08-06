import { EmailReservationStatus } from '@prisma/client'
import { getDbForWorkspace, findUserAcrossShards } from '@/config/prisma'
import { logDependencyFailure } from '@/config/logger'
import { ConflictError, DependencyUnavailableError } from '@/errors'
import {
  activateEmailReservation,
  getEmailReservation,
  reconcileExpiredPendingReservation,
} from './email-reservation.service'

async function loadUserFromRecordedShard(reservation: {
  email: string
  userId: string
  workspaceId: string
  shardId: string
}) {
  let client
  try {
    client = getDbForWorkspace({
      workspaceId: reservation.workspaceId,
      shardId: reservation.shardId,
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
        userId: reservation.userId,
        workspaceId: reservation.workspaceId,
        shardId: reservation.shardId,
      },
    })
  }

  let user
  try {
    user = await client.user.findUnique({ where: { email: reservation.email } })
  } catch (error) {
    throw new DependencyUnavailableError('Failed to load user from identity shard', {
      originalError: error instanceof Error ? error : undefined,
      extensions: {
        userId: reservation.userId,
        workspaceId: reservation.workspaceId,
        shardId: reservation.shardId,
      },
    })
  }

  return { client, user }
}

/**
 * Resolve a user by email.
 * - No reservation → temporary legacy cross-shard scan (backfill gap only).
 * - ACTIVE → exactly the recorded shard; never silent fallback.
 * - PENDING → recorded shard only (activate if user exists; never scan).
 * - RELEASE_PENDING → blocked; never scan.
 */
export async function resolveUserByEmail(email: string) {
  const reservation = await getEmailReservation(email)

  if (!reservation) {
    return findUserAcrossShards((c) => c.user.findUnique({ where: { email } }))
  }

  if (reservation.status === EmailReservationStatus.RELEASE_PENDING) {
    throw new DependencyUnavailableError(
      'Email identity cleanup is pending; authentication is blocked for this address',
      {
        extensions: {
          email,
          userId: reservation.userId,
          code: 'IDENTITY_RELEASE_PENDING',
        },
      }
    )
  }

  if (!reservation.workspaceId || !reservation.shardId) {
    throw new DependencyUnavailableError('Identity reservation has incomplete routing fields', {
      extensions: {
        email,
        userId: reservation.userId,
        status: reservation.status,
        code: 'IDENTITY_ROUTE_INCOMPLETE',
      },
    })
  }

  if (reservation.status === EmailReservationStatus.PENDING) {
    const expired =
      reservation.expiresAt != null && reservation.expiresAt.getTime() < Date.now()

    if (expired) {
      await reconcileExpiredPendingReservation(email)
      const after = await getEmailReservation(email)
      if (!after) {
        return findUserAcrossShards((c) => c.user.findUnique({ where: { email } }))
      }
      if (after.status === EmailReservationStatus.ACTIVE) {
        return resolveUserByEmail(email)
      }
      if (after.status === EmailReservationStatus.PENDING) {
        throw new ConflictError('Email reservation is still pending')
      }
      throw new DependencyUnavailableError(
        'Email identity cleanup is pending; authentication is blocked for this address',
        {
          extensions: {
            email,
            userId: after.userId,
            code: 'IDENTITY_RELEASE_PENDING',
          },
        }
      )
    }

    const { client, user } = await loadUserFromRecordedShard({
      email: reservation.email,
      userId: reservation.userId,
      workspaceId: reservation.workspaceId,
      shardId: reservation.shardId,
    })

    if (
      user &&
      user.id === reservation.userId &&
      user.workspaceId === reservation.workspaceId
    ) {
      await activateEmailReservation(reservation.email, reservation.userId)
      return { result: user, client, shardId: reservation.shardId }
    }

    throw new ConflictError('Email reservation is pending and the account is not ready')
  }

  // ACTIVE
  const { client, user } = await loadUserFromRecordedShard({
    email: reservation.email,
    userId: reservation.userId,
    workspaceId: reservation.workspaceId,
    shardId: reservation.shardId,
  })

  if (
    !user ||
    user.id !== reservation.userId ||
    user.workspaceId !== reservation.workspaceId
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
          userId: reservation.userId,
          workspaceId: reservation.workspaceId,
          shardId: reservation.shardId,
          code: 'IDENTITY_INTEGRITY_ERROR',
        },
      }
    )
  }

  return { result: user, client, shardId: reservation.shardId }
}
