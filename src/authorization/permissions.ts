/**
 * Single source of truth for permission identifiers.
 * GraphQL enum values are derived via graphqlPermissions.ts — keep that file in sync.
 */
export const PERMISSIONS = {
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',
  USERS_MANAGE_STATUS: 'users.manageStatus',
  USERS_MANAGE_ROLES: 'users.manageRoles',
  USERS_MANAGE_PERMISSIONS: 'users.managePermissions',
  ROLES_READ: 'roles.read',
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_DELETE: 'roles.delete',
  WORKSPACE_READ: 'workspace.read',
  WORKSPACE_UPDATE: 'workspace.update',
  WORKSPACE_TRANSFER_OWNERSHIP: 'workspace.transferOwnership',
  AUDIT_READ: 'audit.read',
} as const

export type PermissionId = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ALL_PERMISSIONS: PermissionId[] = Object.values(PERMISSIONS)

export const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS)

export function isPermissionId(value: string): value is PermissionId {
  return PERMISSION_SET.has(value)
}

export function assertPermissions(values: string[]): PermissionId[] {
  const invalid = values.filter((v) => !isPermissionId(v))
  if (invalid.length > 0) {
    throw new Error(`Invalid permissions: ${invalid.join(', ')}`)
  }
  return values as PermissionId[]
}
