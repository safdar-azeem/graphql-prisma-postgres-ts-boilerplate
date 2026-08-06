import { EmailReservationStatus, Prisma } from '@prisma/client'
import { prisma } from '@/config/prisma'
import { ConflictError } from '@/errors'

/** Default TTL for PENDING reservations before they may be reclaimed. */
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
}

async function reclaimExpiredPending(email: string): Promise<void> {
  await prisma.globalEmailReservation.deleteMany({
    where: {
      email,
      status: EmailReservationStatus.PENDING,
      expiresAt: { lt: new Date() },
    },
  })
}

/**
 * Reserve an email on the control-plane DB before inserting a User on any shard.
 * Creates a PENDING row with expiry so crashed processes do not permanently block emails.
 * Idempotent for the same userId while still PENDING and unexpired.
 */
export async function reserveEmail(input: ReserveEmailInput): Promise<void> {
  const { email, userId, workspaceId, shardId } = input
  await reclaimExpiredPending(email)

  const existing = await prisma.globalEmailReservation.findUnique({ where: { email } })
  if (existing) {
    if (existing.status === EmailReservationStatus.ACTIVE) {
      throw new ConflictError('A user with this email already exists')
    }
    if (
      existing.status === EmailReservationStatus.PENDING &&
      existing.userId === userId &&
      (!existing.expiresAt || existing.expiresAt > new Date())
    ) {
      // Idempotent retry of the same signup attempt
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

/** Mark reservation ACTIVE after the shard user write succeeds. */
export async function activateEmailReservation(email: string, userId: string): Promise<void> {
  const updated = await prisma.globalEmailReservation.updateMany({
    where: { email, userId, status: EmailReservationStatus.PENDING },
    data: {
      status: EmailReservationStatus.ACTIVE,
      expiresAt: null,
    },
  })
  if (updated.count === 0) {
    // Already active for this user is fine (idempotent); otherwise leave for reconcile
    const current = await prisma.globalEmailReservation.findUnique({ where: { email } })
    if (
      current?.userId === userId &&
      current.status === EmailReservationStatus.ACTIVE
    ) {
      return
    }
    throw new ConflictError('Email reservation could not be activated')
  }
}

/**
 * Release a reservation only when email + userId match.
 * Used after failed shard writes and after user deletion (emails are reusable).
 */
export async function releaseEmailReservation(email: string, userId: string): Promise<void> {
  await prisma.globalEmailReservation
    .deleteMany({ where: { email, userId } })
    .catch(() => undefined)
}

/** Lookup control-plane routing for an email (ACTIVE only). */
export async function findIdentityByEmail(email: string): Promise<IdentityRoute | null> {
  const row = await prisma.globalEmailReservation.findUnique({ where: { email } })
  if (
    !row ||
    row.status !== EmailReservationStatus.ACTIVE ||
    !row.workspaceId ||
    !row.shardId
  ) {
    return null
  }
  return {
    email: row.email,
    userId: row.userId,
    workspaceId: row.workspaceId,
    shardId: row.shardId,
    status: row.status,
  }
}
