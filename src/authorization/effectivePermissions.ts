import { UserType } from '@prisma/client'
import { ALL_PERMISSIONS, isPermissionId, type PermissionId } from './permissions'

export function computeEffectivePermissions(opts: {
  userType: UserType
  rolePermissions: string[][]
  customPermissions: string[]
}): PermissionId[] {
  if (opts.userType === UserType.OWNER) {
    return [...ALL_PERMISSIONS]
  }

  const merged = new Set<PermissionId>()
  for (const list of opts.rolePermissions) {
    for (const p of list) {
      if (isPermissionId(p)) merged.add(p)
    }
  }
  for (const p of opts.customPermissions) {
    if (isPermissionId(p)) merged.add(p)
  }
  return Array.from(merged)
}
