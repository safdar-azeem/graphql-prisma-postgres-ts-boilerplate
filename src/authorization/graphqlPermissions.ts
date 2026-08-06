import { PERMISSIONS, type PermissionId } from './permissions'

/**
 * GraphQL Permissions enum member → catalog ID.
 * Generated from PERMISSIONS keys (USERS_READ → users.read).
 */
export const GRAPHQL_TO_PERMISSION: Record<string, PermissionId> = Object.fromEntries(
  Object.entries(PERMISSIONS).map(([graphqlKey, id]) => [graphqlKey, id])
) as Record<string, PermissionId>

export const PERMISSION_TO_GRAPHQL: Record<PermissionId, string> = Object.fromEntries(
  Object.entries(PERMISSIONS).map(([graphqlKey, id]) => [id, graphqlKey])
) as Record<PermissionId, string>

export function toPermissionIds(graphqlValues: string[]): PermissionId[] {
  return graphqlValues.map((v) => {
    if (GRAPHQL_TO_PERMISSION[v]) return GRAPHQL_TO_PERMISSION[v]
    if (Object.values(PERMISSIONS).includes(v as PermissionId)) return v as PermissionId
    throw new Error(`Invalid permission: ${v}`)
  })
}

export function toGraphqlPermissions(ids: string[]): string[] {
  return ids.map((id) => PERMISSION_TO_GRAPHQL[id as PermissionId] || id)
}

/** GraphQL SDL enum body derived from the catalog (for docs / sync checks). */
export function graphqlPermissionsEnumBody(): string {
  return Object.keys(PERMISSIONS).join('\n  ')
}
