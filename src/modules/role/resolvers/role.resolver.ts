import { Permission } from '@prisma/client'
import { Protect } from '@/guards'
import { Context } from '@/types/context.type'
import { Resolvers } from '@/types/types.generated'
import { NotFoundError, ValidationError } from '@/errors'

export const roleResolver: Resolvers<Context> = {
  Query: {
    getRoles: Protect([Permission.ROLE_VIEW], async (_parent, _args, { ownerId, client }) => {
      return await client.role.findMany({
        where: { ownerId },
        orderBy: { createdAt: 'asc' },
      })
    }),

    getRole: Protect([Permission.ROLE_VIEW], async (_parent, { id }, { ownerId, client }) => {
      const role = await client.role.findFirst({ where: { id, ownerId } })
      if (!role) throw new NotFoundError('Role not found')
      return role
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

      return await client.role.create({
        data: {
          name: data.name,
          permissions: (data.permissions ?? []) as Permission[],
          ownerId,
        },
      })
    }),

    updateRole: Protect([Permission.ROLE_UPDATE], async (_parent, { id, data }, { ownerId, client }) => {
      const role = await client.role.findFirst({ where: { id, ownerId } })
      if (!role) throw new NotFoundError('Role not found')

      if (data.name && data.name !== role.name) {
        const duplicate = await client.role.findFirst({ where: { name: data.name, ownerId } })
        if (duplicate) throw new ValidationError(`Role "${data.name}" already exists`)
      }

      if (data.permissions !== undefined) {
        const validPermissions = Object.values(Permission)
        const invalid = data.permissions.filter(
          (p: string) => !validPermissions.includes(p as Permission)
        )
        if (invalid.length > 0) {
          throw new ValidationError(`Invalid permissions: ${invalid.join(', ')}`)
        }
      }

      return await client.role.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.permissions !== undefined && {
            permissions: data.permissions as Permission[],
          }),
        },
      })
    }),

    deleteRole: Protect([Permission.ROLE_DELETE], async (_parent, { id }, { ownerId, client }) => {
      const role = await client.role.findFirst({ where: { id, ownerId } })
      if (!role) throw new NotFoundError('Role not found')

      await client.role.delete({ where: { id } })
      return true
    }),
  },
}
