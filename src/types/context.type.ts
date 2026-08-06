import type { PrismaClient, User, UserType, UserStatus, WorkspaceStatus } from '@prisma/client'
import type { PermissionId } from '@/authorization/permissions'

/** Authenticated user without password hash. */
export type AuthUser = Omit<User, 'password'>

export interface Context {
  user: AuthUser | null
  isAuthenticated: boolean
  /** True when access token is valid but MFA verification is still pending. */
  is2faPending: boolean
  client: PrismaClient | null
  userType?: UserType
  workspaceId: string
  workspaceStatus?: WorkspaceStatus
  permissions: PermissionId[]
  userStatus?: UserStatus
}
