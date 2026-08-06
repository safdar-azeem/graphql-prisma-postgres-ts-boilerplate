-- CreateEnum
CREATE TYPE "EmailReservationStatus" AS ENUM ('PENDING', 'ACTIVE');

-- CreateTable
CREATE TABLE "GlobalEmailReservation" (
    "email" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "shardId" TEXT,
    "status" "EmailReservationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "GlobalEmailReservation_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE INDEX "GlobalEmailReservation_status_expiresAt_idx" ON "GlobalEmailReservation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "GlobalEmailReservation_userId_idx" ON "GlobalEmailReservation"("userId");
