import { ValidationError } from '@/errors'
import { toPermissionIds } from '@/authorization/graphqlPermissions'
import type { PermissionId } from '@/authorization/permissions'

export function parseRolePermissions(values: string[] | null | undefined): PermissionId[] {
  if (!values) return []
  try {
    return toPermissionIds(values)
  } catch (e: any) {
    throw new ValidationError(e.message || 'Invalid permissions')
  }
}

export function validateRoleName(name: string | null | undefined) {
  const trimmed = name?.trim()
  if (!trimmed || trimmed.length < 2) {
    throw new ValidationError('Role name must be at least 2 characters')
  }
  return trimmed
}
