import { ValidationError } from '@/errors'
import { normalizeEmail } from '@/utils/email-normalize.util'
import { toPermissionIds } from '@/authorization/graphqlPermissions'
import type { PermissionId } from '@/authorization/permissions'

export function validateCreateUserInput(data: {
  email: string
  username: string
  password: string
  customPermissions?: string[] | null
}) {
  const email = normalizeEmail(data.email)
  const username = data.username?.trim()
  if (!email.includes('@')) throw new ValidationError('A valid email is required')
  if (!username || username.length < 2) {
    throw new ValidationError('Username must be at least 2 characters')
  }
  if (!data.password || data.password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters')
  }

  let customPermissions: PermissionId[] = []
  if (data.customPermissions?.length) {
    try {
      customPermissions = toPermissionIds(data.customPermissions)
    } catch (e: any) {
      throw new ValidationError(e.message || 'Invalid permissions')
    }
  }

  return { email, username, password: data.password, customPermissions }
}

export function parseCustomPermissions(values: string[] | null | undefined): PermissionId[] | undefined {
  if (values === undefined || values === null) return undefined
  try {
    return toPermissionIds(values)
  } catch (e: any) {
    throw new ValidationError(e.message || 'Invalid permissions')
  }
}
