import { EmailReservationStatus, Prisma } from '@prisma/client'
import { getDbForWorkspace, prisma } from '@/config/prisma'
import { logDependencyFailure } from '@/config/logger'
import { ConflictError, DependencyUnavailableError } from '@/errors'

/** Default TTL for PENDING reservations before they may be reconciled. */
export const PENDING_RESERVATION_TTL_MS = 15 * 60 * 1000

export type ReserveEmailInput = {
  email: string
  userId: string
  workspaceId: string
  shardId: string
}

export type IdentityRoute = {
  email: string
  userId: string
  workspaceId: string
  shardId: string
  status: EmailReservationStatus
  expiresAt?: Date | null
}

export type ReconcileResult = 'activated' | 'released' | 'kept'

/**
 * Reconcile an expired PENDING reservation against its recorded shard.
 * Never deletes solely because expiresAt passed.
 */
export async function reconcileExpiredPendingReservation(
  email: string
): Promise<ReconcileResult> {
  const row = await prisma.globalEmailReservation.findUnique({ where: { email } })
  if (!row || row.status !== EmailReservationStatus.PENDING) {
    return 'kept'
  }
  if (!row.expiresAt || row.expiresAt >= new Date()) {
    return 'kept'
  }

  if (!row.shardId || !row.workspaceId || !row.userId) {
    await prisma.globalEmailReservation.deleteMany({
      where: {
        email,
        userId: row.userId,
        status: EmailReservationStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
    })
    return 'released'
  }

  let client
  try {
    client = getDbForWorkspace({
      workspaceId: row.workspaceId,
      shardId: row.shardId,
    })
  } catch (error) {
    logDependencyFailure({
      dependency: 'identity-reservation',
      operation: 'reconcile-expired-shard-unavailable',
      error,
    })
    throw new DependencyUnavailableError(
      'Cannot reconcile expired email reservation; recorded shard is unavailable',
      {
        originalError: error instanceof Error ? error : undefined,
        extensions: {
          email,
          userId: row.userId,
          workspaceId: row.workspaceId,
          shardId: row.shardId,
        },
      }
    )
  }

  let user: { id: string; email: string; workspaceId: string } | null
  try {
    user = await client.user.findFirst({
      where: {
        id: row.userId,
        email: row.email,
        workspaceId: row.workspaceId,
      },
      select: { id: true, email: true, workspaceId: true },
    })
  } catch (error) {
    throw new DependencyUnavailableError(
      'Cannot reconcile expired email reservation; shard lookup failed',
      {
        originalError: error instanceof Error ? error : undefined,
        extensions: {
          email,
          userId: row.userId,
          workspaceId: row.workspaceId,
          shardId: row.shardId,
        },
      }
    )
  }

  if (user) {
    // Conditional activate — concurrent callers remain safe
    await prisma.globalEmailReservation.updateMany({
      where: {
        email,
        userId: row.userId,
        status: EmailReservationStatus.PENDING,
      },
      data: {
        status: EmailReservationStatus.ACTIVE,
        expiresAt: null,
      },
    })
    return 'activated'
  }

  await prisma.globalEmailReservation.deleteMany({
    where: {
      email,
      userId: row.userId,
      status: EmailReservationStatus.PENDING,
      expiresAt: { lt: new Date() },
    },
  })
  return 'released'
}

/**
 * Reserve an email on the control-plane DB before inserting a User on any shard.
 * Creates a PENDING row with expiry. Idempotent for the same userId while PENDING.
 */
export async function reserveEmail(input: ReserveEmailInput): Promise<void> {
  const { email, userId, workspaceId, shardId } = input
  await reconcileExpiredPendingReservation(email)

  const existing = await prisma.globalEmailReservation.findUnique({ where: { email } })
  if (existing) {
    if (
      existing.status === EmailReservationStatus.ACTIVE ||
      existing.status === EmailReservationStatus.RELEASE_PENDING
    ) {
      throw new ConflictError('A user with this email already exists')
    }
    if (
      existing.status === EmailReservationStatus.PENDING &&
      existing.userId === userId &&
      (!existing.expiresAt || existing.expiresAt > new Date())
    ) {
      await prisma.globalEmailReservation.update({
        where: { email },
        data: {
          workspaceId,
          shardId,
          expiresAt: new Date(Date.now() + PENDING_RESERVATION_TTL_MS),
        },
      })
      return
    }
    throw new ConflictError('A user with this email already exists')
  }

  try {
    await prisma.globalEmailReservation.create({
      data: {
        email,
        userId,
        workspaceId,
        shardId,
        status: EmailReservationStatus.PENDING,
        expiresAt: new Date(Date.now() + PENDING_RESERVATION_TTL_MS),
      },
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictError('A user with this email already exists')
    }
    throw error
  }
}

/** Mark reservation ACTIVE after the shard user write succeeds. Idempotent. */
export async function activateEmailReservation(email: string, userId: string): Promise<void> {
  const updated = await prisma.globalEmailReservation.updateMany({
    where: { email, userId, status: EmailReservationStatus.PENDING },
    data: {
      status: EmailReservationStatus.ACTIVE,
      expiresAt: null,
    },
  })
  if (updated.count === 0) {
    const current = await prisma.globalEmailReservation.findUnique({ where: { email } })
    if (
      current?.userId === userId &&
      current.status === EmailReservationStatus.ACTIVE
    ) {
      return
    }
    throw new DependencyUnavailableError('Email reservation could not be activated', {
      extensions: { email, userId },
    })
  }
}

/**
 * Activate after a successful shard commit.
 * On failure, leave PENDING for reconciliation — never release.
 */
export async function activateAfterShardCommit(email: string, userId: string): Promise<void> {
  try {
    await activateEmailReservation(email, userId)
  } catch (error) {
    logDependencyFailure({
      dependency: 'identity-reservation',
      operation: 'activate-after-commit',
      error,
    })
    throw new DependencyUnavailableError(
      'Account was created but identity activation is pending',
      {
        originalError: error instanceof Error ? error : undefined,
        extensions: { email, userId, code: 'IDENTITY_ACTIVATION_PENDING' },
      }
    )
  }
}

/**
 * Release a reservation only when email + userId match.
 * Propagates control-plane failures (callers must not ignore them silently).
 */
export async function releaseEmailReservation(email: string, userId: string): Promise<void> {
  await prisma.globalEmailReservation.deleteMany({ where: { email, userId } })
}

/** Best-effort release after a rolled-back shard write; logs but does not hide the original error. */
export async function releaseAfterFailedShardWrite(
  email: string,
  userId: string
): Promise<void> {
  try {
    await releaseEmailReservation(email, userId)
  } catch (error) {
    logDependencyFailure({
      dependency: 'identity-reservation',
      operation: 'release-after-failed-shard-write',
      error,
    })
  }
}

/**
 * Durable delete marker: mark RELEASE_PENDING on the control plane BEFORE
 * deleting the shard user. Failures here must abort deletion so we never leave
 * an undiscoverable ACTIVE orphan after a successful shard delete.
 */
export async function markReleasePendingBeforeDelete(
  email: string,
  userId: string
): Promise<void> {
  try {
    const updated = await prisma.globalEmailReservation.updateMany({
      where: {
        email,
        userId,
        status: {
          in: [EmailReservationStatus.ACTIVE, EmailReservationStatus.PENDING],
        },
      },
      data: {
        status: EmailReservationStatus.RELEASE_PENDING,
        expiresAt: null,
      },
    })

    if (updated.count > 0) return

    const current = await prisma.globalEmailReservation.findUnique({ where: { email } })
    if (!current) {
      // Legacy user with no control-plane row — safe to proceed
      return
    }
    if (
      current.userId === userId &&
      current.status === EmailReservationStatus.RELEASE_PENDING
    ) {
      // Idempotent retry after a previous partial delete
      return
    }

    throw new ConflictError('Email reservation does not match the user being deleted', {
      extensions: { email, userId, code: 'IDENTITY_RELEASE_MISMATCH' },
    })
  } catch (error) {
    if (error instanceof ConflictError || error instanceof DependencyUnavailableError) {
      throw error
    }
    logDependencyFailure({
      dependency: 'identity-reservation',
      operation: 'mark-release-pending-before-delete',
      error,
    })
    throw new DependencyUnavailableError(
      'Cannot start user deletion; identity release marker could not be written',
      {
        originalError: error instanceof Error ? error : undefined,
        extensions: {
          email,
          userId,
          code: 'IDENTITY_RELEASE_MARK_FAILED',
        },
      }
    )
  }
}

/**
 * After successful shard user deletion, remove the RELEASE_PENDING reservation.
 * On failure the row stays RELEASE_PENDING and remains discoverable by batch reconcile.
 */
export async function finalizeReleaseAfterUserDelete(
  email: string,
  userId: string
): Promise<void> {
  try {
    await prisma.globalEmailReservation.deleteMany({
      where: {
        email,
        userId,
        status: EmailReservationStatus.RELEASE_PENDING,
      },
    })
  } catch (error) {
    logDependencyFailure({
      dependency: 'identity-reservation',
      operation: 'finalize-release-after-user-delete',
      error,
    })
    throw new DependencyUnavailableError(
      'User was deleted but email reservation cleanup is pending; email is not yet reusable',
      {
        originalError: error instanceof Error ? error : undefined,
        extensions: {
          email,
          userId,
          code: 'IDENTITY_RELEASE_PENDING',
        },
      }
    )
  }
}

/** @deprecated Use markReleasePendingBeforeDelete + finalizeReleaseAfterUserDelete */
export async function releaseAfterUserDelete(email: string, userId: string): Promise<void> {
  await finalizeReleaseAfterUserDelete(email, userId)
}

export type ReconcileReleaseResult = 'released' | 'kept' | 'restored'

/**
 * Reconcile a RELEASE_PENDING (or orphan ACTIVE) row against the recorded shard.
 * - User missing → delete reservation
 * - User still present + RELEASE_PENDING → restore ACTIVE
 * - User still present + ACTIVE → keep
 * - Shard unavailable → preserve row
 */
export async function reconcileReleasePending(
  email: string,
  userId: string
): Promise<ReconcileReleaseResult> {
  const row = await prisma.globalEmailReservation.findUnique({ where: { email } })
  if (!row || row.userId !== userId) return 'kept'

  if (
    row.status !== EmailReservationStatus.RELEASE_PENDING &&
    row.status !== EmailReservationStatus.ACTIVE
  ) {
    return 'kept'
  }

  if (!row.shardId || !row.workspaceId) {
    return 'kept'
  }

  let client
  try {
    client = getDbForWorkspace({
      workspaceId: row.workspaceId,
      shardId: row.shardId,
    })
  } catch (error) {
    logDependencyFailure({
      dependency: 'identity-reservation',
      operation: 'reconcile-release-shard-unavailable',
      error,
    })
    throw new DependencyUnavailableError(
      'Cannot reconcile identity cleanup; recorded shard is unavailable',
      {
        originalError: error instanceof Error ? error : undefined,
        extensions: {
          email,
          userId: row.userId,
          workspaceId: row.workspaceId,
          shardId: row.shardId,
        },
      }
    )
  }

  let user: { id: string } | null
  try {
    user = await client.user.findFirst({
      where: {
        id: row.userId,
        email: row.email,
        workspaceId: row.workspaceId,
      },
      select: { id: true },
    })
  } catch (error) {
    throw new DependencyUnavailableError(
      'Cannot reconcile identity cleanup; shard lookup failed',
      {
        originalError: error instanceof Error ? error : undefined,
        extensions: {
          email,
          userId: row.userId,
          workspaceId: row.workspaceId,
          shardId: row.shardId,
        },
      }
    )
  }

  if (user) {
    if (row.status === EmailReservationStatus.RELEASE_PENDING) {
      await prisma.globalEmailReservation.updateMany({
        where: {
          email,
          userId,
          status: EmailReservationStatus.RELEASE_PENDING,
        },
        data: {
          status: EmailReservationStatus.ACTIVE,
          expiresAt: null,
        },
      })
      return 'restored'
    }
    return 'kept'
  }

  const deleted = await prisma.globalEmailReservation.deleteMany({
    where: {
      email,
      userId,
      status: row.status,
    },
  })
  return deleted.count > 0 ? 'released' : 'kept'
}

/** Process all RELEASE_PENDING rows (operations / worker entrypoint). */
export async function reconcileAllReleasePending(): Promise<{
  released: number
  kept: number
  restored: number
  errors: number
}> {
  const rows = await prisma.globalEmailReservation.findMany({
    where: { status: EmailReservationStatus.RELEASE_PENDING },
    select: { email: true, userId: true },
  })

  let released = 0
  let kept = 0
  let restored = 0
  let errors = 0

  for (const row of rows) {
    try {
      const outcome = await reconcileReleasePending(row.email, row.userId)
      if (outcome === 'released') released++
      else if (outcome === 'restored') restored++
      else kept++
    } catch (error) {
      errors++
      logDependencyFailure({
        dependency: 'identity-reservation',
        operation: 'reconcile-all-release-pending',
        error,
      })
    }
  }

  return { released, kept, restored, errors }
}

/** Any control-plane reservation for an email (all statuses). */
export async function getEmailReservation(email: string): Promise<IdentityRoute | null> {
  const row = await prisma.globalEmailReservation.findUnique({ where: { email } })
  if (!row) return null
  return {
    email: row.email,
    userId: row.userId,
    workspaceId: row.workspaceId || '',
    shardId: row.shardId || '',
    status: row.status,
    expiresAt: row.expiresAt,
  }
}

/** Lookup control-plane routing for an email (ACTIVE only, complete route). */
export async function findIdentityByEmail(email: string): Promise<IdentityRoute | null> {
  const row = await getEmailReservation(email)
  if (
    !row ||
    row.status !== EmailReservationStatus.ACTIVE ||
    !row.workspaceId ||
    !row.shardId
  ) {
    return null
  }
  return row
}
