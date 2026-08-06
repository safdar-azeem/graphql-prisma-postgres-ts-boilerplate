import { describe, it, expect } from 'vitest'
import { PERMISSIONS, isPermissionId } from '@/authorization/permissions'
import { computeEffectivePermissions } from '@/authorization/effectivePermissions'
import { toPermissionIds, toGraphqlPermissions } from '@/authorization/graphqlPermissions'

const OWNER = 'OWNER' as any
const MEMBER = 'MEMBER' as any

describe('permissions catalog', () => {
  it('validates namespaced permission ids', () => {
    expect(isPermissionId(PERMISSIONS.USERS_READ)).toBe(true)
    expect(isPermissionId('USER_VIEW')).toBe(false)
  })

  it('maps graphql enum values to catalog ids', () => {
    expect(toPermissionIds(['USERS_READ', 'ROLES_CREATE'])).toEqual([
      PERMISSIONS.USERS_READ,
      PERMISSIONS.ROLES_CREATE,
    ])
    expect(toGraphqlPermissions([PERMISSIONS.USERS_READ])).toEqual(['USERS_READ'])
  })

  it('gives owners all permissions', () => {
    const perms = computeEffectivePermissions({
      userType: OWNER,
      rolePermissions: [],
      customPermissions: [],
    })
    expect(perms).toContain(PERMISSIONS.WORKSPACE_TRANSFER_OWNERSHIP)
  })

  it('merges role and custom permissions for members', () => {
    const perms = computeEffectivePermissions({
      userType: MEMBER,
      rolePermissions: [[PERMISSIONS.USERS_READ]],
      customPermissions: [PERMISSIONS.ROLES_READ],
    })
    expect(perms.sort()).toEqual([PERMISSIONS.ROLES_READ, PERMISSIONS.USERS_READ].sort())
  })
})
