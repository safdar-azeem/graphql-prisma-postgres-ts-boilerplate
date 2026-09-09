-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('OWNER', 'EMPLOYEE', 'CUSTOMER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "MfaMethod" AS ENUM ('EMAIL', 'AUTHENTICATOR');

-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('USER_VIEW', 'USER_CREATE', 'USER_UPDATE', 'USER_DELETE', 'ROLE_VIEW', 'ROLE_CREATE', 'ROLE_UPDATE', 'ROLE_DELETE');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "password" TEXT NOT NULL,
ADD COLUMN "userType" "UserType" NOT NULL DEFAULT 'OWNER',
ADD COLUMN "avatar" TEXT,
ADD COLUMN "googleId" TEXT,
ADD COLUMN "mfaSettings" JSONB,
ADD COLUMN "otp" JSONB,
ADD COLUMN "passwordReset" JSONB,
ADD COLUMN "ownerId" TEXT,
ADD COLUMN "customPermissions" "Permission"[] NOT NULL DEFAULT ARRAY[]::"Permission"[],
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Remove temporary defaults.
ALTER TABLE "User"
ALTER COLUMN "customPermissions" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropIndex
DROP INDEX "User_email_key";

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "permissions" "Permission"[] NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_UserRoles" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UserRoles_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_ownerId_userType_key" ON "User"("email", "ownerId", "userType");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_userType_idx" ON "User"("userType");

-- CreateIndex
CREATE INDEX "User_ownerId_idx" ON "User"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_ownerId_key" ON "Role"("name", "ownerId");

-- CreateIndex
CREATE INDEX "Role_ownerId_idx" ON "Role"("ownerId");

-- CreateIndex
CREATE INDEX "_UserRoles_B_index" ON "_UserRoles"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserRoles" ADD CONSTRAINT "_UserRoles_A_fkey" FOREIGN KEY ("A") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserRoles" ADD CONSTRAINT "_UserRoles_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
