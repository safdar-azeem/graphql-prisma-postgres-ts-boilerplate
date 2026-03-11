import { Permission } from '@prisma/client'
import { Protect } from '@/guards'
import { Context } from '@/types/context.type'
import { Resolvers } from '@/types/types.generated'
import { NotFoundError, ValidationError } from '@/errors'
import { getPagination, getPageInfo, getDateRangeFilter } from '@/utils/query.util'

export const roleResolver: Resolvers<Context> = {
  Query: {
    getRoles: Protect([Permission.ROLE_VIEW], async (_parent, { pagination, search, filter }, { ownerId, client }) => {
      const { page, limit, skip } = getPagination(pagination)
      const where: any = { ownerId }

      if (search) {
        where.name = { contains: search, mode: 'insensitive' }
      }

      const dateFilter = getDateRangeFilter(filter?.dateRange)
      if (dateFilter) {
        where.createdAt = dateFilter
      }

      const [items, totalItems] = await Promise.all([
        client.role.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        client.role.count({ where }),
      ])

      return {
        items: items as any,
        pageInfo: getPageInfo(totalItems, limit, page),
      }
    }),

    getRole: Protect([Permission.ROLE_VIEW], async (_parent, { id }, { ownerId, client }) => {
      const role = await client.role.findFirst({ where: { id, ownerId } })
      if (!role) throw new NotFoundError('Role not found')
      return role as any
    }),
  },

  Mutation: {
    createRole: Protect([Permission.ROLE_CREATE], async (_parent, { data }, { ownerId, client }) => {
      const existing = await client.role.findFirst({ where: { name: data.name, ownerId } })
      if (existing) throw new ValidationError(`Role "${data.name}" already exists`)

      // Validate that all supplied permissions are valid enum values
      const validPermissions = Object.values(Permission)
      const invalid = (data.permissions ?? []).filter(
        (p: string) => !validPermissions.includes(p as Permission)
      )
      if (invalid.length > 0) {
        throw new ValidationError(`Invalid permissions: ${invalid.join(', ')}`)
      }

      const role = await client.role.create({
        data: {
          name: data.name,
          permissions: (data.permissions ?? []) as Permission[],
          ownerId,
        },
      })
      
      return role as any
    }),

    updateRole: Protect([Permission.ROLE_UPDATE], async (_parent, { id, data }, { ownerId, client }) => {
      const role = await client.role.findFirst({ where: { id, ownerId } })
      if (!role) throw new NotFoundError('Role not found')

      if (data.name && data.name !== role.name) {
        const duplicate = await client.role.findFirst({ where: { name: data.name, ownerId } })
        if (duplicate) throw new ValidationError(`Role "${data.name}" already exists`)
      }

      if (data.permissions !== undefined && data.permissions !== null) {
        const validPermissions = Object.values(Permission)
        const invalid = data.permissions.filter(
          (p: string) => !validPermissions.includes(p as Permission)
        )
        if (invalid.length > 0) {
          throw new ValidationError(`Invalid permissions: ${invalid.join(', ')}`)
        }
      }

      const updated = await client.role.update({
        where: { id },
        data: {
          ...(data.name !== undefined && data.name !== null && { name: data.name }),
          ...(data.permissions !== undefined && data.permissions !== null && {
            permissions: data.permissions as Permission[],
          }),
        },
      })
      
      return updated as any
    }),

    deleteRole: Protect([Permission.ROLE_DELETE], async (_parent, { id }, { ownerId, client }) => {
      const role = await client.role.findFirst({ where: { id, ownerId } })
      if (!role) throw new NotFoundError('Role not found')

      await client.role.delete({ where: { id } })
      return true
    }),
  },
}
