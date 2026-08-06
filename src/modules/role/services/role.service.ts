import type { PrismaClient } from '@prisma/client'
import { ConflictError, mapPrismaError } from '@/errors'
import { getPagination, getPageInfo, getDateRangeFilter, getSafeOrderBy } from '@/utils/query.util'
import { toGraphqlPermissions } from '@/authorization/graphqlPermissions'
import { parseRolePermissions, validateRoleName } from '../validation/role.schema'
import { assertRoleMutable, getWorkspaceRole } from '../policies/role.policy'

const ROLE_SORT_FIELDS = ['name', 'createdAt', 'updatedAt', 'id'] as const

function mapRole(role: any) {
  return {
    ...role,
    permissions: toGraphqlPermissions(role.permissions || []),
  }
}

export async function listRoles(
  client: PrismaClient,
  workspaceId: string,
  args: {
    pagination?: any
    search?: string | null
    filter?: any
    sort?: any
  }
) {
  const { page, limit, skip } = getPagination(args.pagination)
  const where: any = { workspaceId }

  if (args.search) {
    where.name = { contains: args.search, mode: 'insensitive' }
  }

  const dateFilter = getDateRangeFilter(args.filter?.dateRange)
  if (dateFilter) where.createdAt = dateFilter
  if (typeof args.filter?.isSystem === 'boolean') where.isSystem = args.filter.isSystem

  const orderBy = getSafeOrderBy(
    {
      field: args.sort?.field,
      direction: args.sort?.direction === 'ASC' ? 'asc' : args.sort?.direction === 'DESC' ? 'desc' : args.sort?.direction,
    },
    ROLE_SORT_FIELDS,
    'createdAt',
    'desc'
  )

  const [items, totalItems] = await Promise.all([
    client.role.findMany({ where, skip, take: limit, orderBy }),
    client.role.count({ where }),
  ])

  return {
    items: items.map(mapRole),
    pageInfo: getPageInfo(totalItems, limit, page),
  }
}

export async function getRole(client: PrismaClient, workspaceId: string, id: string) {
  return mapRole(await getWorkspaceRole(client, workspaceId, id))
}

export async function createRole(
  client: PrismaClient,
  workspaceId: string,
  data: { name: string; description?: string | null; permissions: string[] }
) {
  const name = validateRoleName(data.name)
  const permissions = parseRolePermissions(data.permissions)

  const existing = await client.role.findFirst({ where: { name, workspaceId } })
  if (existing) throw new ConflictError(`Role "${name}" already exists`)

  try {
    const role = await client.role.create({
      data: {
        name,
        description: data.description?.trim() || null,
        permissions,
        workspaceId,
      },
    })
    return mapRole(role)
  } catch (error) {
    const mapped = mapPrismaError(error)
    if (mapped) throw mapped
    throw error
  }
}

export async function updateRole(
  client: PrismaClient,
  workspaceId: string,
  id: string,
  data: { name?: string | null; description?: string | null; permissions?: string[] | null }
) {
  const role = await getWorkspaceRole(client, workspaceId, id)
  assertRoleMutable(role, 'updated')

  const updates: any = {}
  if (data.name != null) {
    const name = validateRoleName(data.name)
    if (name !== role.name) {
      const duplicate = await client.role.findFirst({ where: { name, workspaceId } })
      if (duplicate) throw new ConflictError(`Role "${name}" already exists`)
    }
    updates.name = name
  }
  if (data.description !== undefined) {
    updates.description = data.description?.trim() || null
  }
  if (data.permissions != null) {
    updates.permissions = parseRolePermissions(data.permissions)
  }

  const updated = await client.role.update({ where: { id }, data: updates })
  return mapRole(updated)
}

export async function deleteRole(client: PrismaClient, workspaceId: string, id: string) {
  const role = await getWorkspaceRole(client, workspaceId, id)
  assertRoleMutable(role, 'deleted')
  await client.role.delete({ where: { id } })
  return true
}
