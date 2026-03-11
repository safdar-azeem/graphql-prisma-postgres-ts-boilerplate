import { Permission, UserType } from '@prisma/client'
import { Protect } from '@/guards'
import { Context } from '@/types/context.type'
import { Resolvers } from '@/types/types.generated'
import { NotFoundError, ValidationError } from '@/errors'
import { hashPassword } from '@/modules/auth/utils/auth.utils'
import { cache } from '@/cache'

export const userManagementResolver: Resolvers<Context> = {
  Query: {
    getUsers: Protect(
      [Permission.USER_VIEW],
      async (_parent, { filter, pagination }, { ownerId, client }) => {
        const page = pagination?.page ?? 1
        const limit = pagination?.limit ?? 10
        const skip = (page - 1) * limit

        const where: any = {
          ownerId,
          userType: { not: UserType.OWNER },
        }

        if (filter?.userType) where.userType = filter.userType as UserType
        if (filter?.search) {
          where.OR = [
            { username: { contains: filter.search, mode: 'insensitive' } },
            { email: { contains: filter.search, mode: 'insensitive' } },
          ]
        }

        const [items, totalItems] = await Promise.all([
          client.user.findMany({
            where,
            skip,
            take: limit,
            include: { roles: true },
            orderBy: { createdAt: 'desc' },
          }),
          client.user.count({ where }),
        ])

        return {
          items: items as any,
          pageInfo: {
            totalItems,
            totalPages: Math.ceil(totalItems / limit),
            currentPage: page,
          },
        }
      }
    ),

    getUser: Protect([Permission.USER_VIEW], async (_parent, { id }, { ownerId, client }) => {
      const found = await client.user.findFirst({
        where: { id, ownerId },
        include: { roles: true },
      })

      if (!found) throw new NotFoundError('User not found')
      return found as any
    }),
  },

  Mutation: {
    createUser: Protect(
      [Permission.USER_CREATE],
      async (_parent, { data }, { ownerId, client }) => {
        if (data.userType === UserType.OWNER) {
          throw new ValidationError('Cannot create another OWNER through user management')
        }

        const existing = await client.user.findFirst({
          where: { email: data.email, ownerId, userType: data.userType as UserType },
        })
        if (existing) {
          throw new ValidationError('A user with this email and type already exists')
        }

        const hashedPassword = await hashPassword(data.password)

        const roleConnect: { id: string }[] = []
        if (data.roleIds && data.roleIds.length > 0) {
          const roles = await client.role.findMany({
            where: { id: { in: data.roleIds }, ownerId },
          })
          if (roles.length !== data.roleIds.length) {
            throw new ValidationError('One or more role IDs are invalid')
          }
          roleConnect.push(...data.roleIds.map((id: string) => ({ id })))
        }

        // Validate customPermissions are valid enum values
        const validPermissions = Object.values(Permission)
        const invalidPerms = (data.customPermissions ?? []).filter(
          (p: string) => !validPermissions.includes(p as Permission)
        )
        if (invalidPerms.length > 0) {
          throw new ValidationError(`Invalid permissions: ${invalidPerms.join(', ')}`)
        }

        const newUser = await client.user.create({
          data: {
            email: data.email,
            username: data.username,
            password: hashedPassword,
            userType: data.userType as UserType,
            ownerId,
            customPermissions: (data.customPermissions ?? []) as Permission[],
            ...(roleConnect.length > 0 && { roles: { connect: roleConnect } }),
          },
          include: { roles: true },
        })

        const { password: _, ...userWithoutPassword } = newUser
        return userWithoutPassword as any
      }
    ),

    updateUser: Protect(
      [Permission.USER_UPDATE],
      async (_parent, { id, data }, { ownerId, client }) => {
        const target = await client.user.findFirst({ where: { id, ownerId } })
        if (!target) throw new NotFoundError('User not found')

        let rolesUpdate: any = undefined
        if (data.roleIds !== undefined) {
          if (data.roleIds.length > 0) {
            const roles = await client.role.findMany({
              where: { id: { in: data.roleIds }, ownerId },
            })
            if (roles.length !== data.roleIds.length) {
              throw new ValidationError('One or more role IDs are invalid')
            }
          }
          rolesUpdate = { set: data.roleIds.map((rid: string) => ({ id: rid })) }
        }

        // Validate customPermissions are valid enum values
        if (data.customPermissions !== undefined) {
          const validPermissions = Object.values(Permission)
          const invalidPerms = data.customPermissions.filter(
            (p: string) => !validPermissions.includes(p as Permission)
          )
          if (invalidPerms.length > 0) {
            throw new ValidationError(`Invalid permissions: ${invalidPerms.join(', ')}`)
          }
        }

        const updated = await client.user.update({
          where: { id },
          data: {
            ...(data.username !== undefined && { username: data.username }),
            ...(data.avatar !== undefined && { avatar: data.avatar }),
            ...(data.customPermissions !== undefined && {
              customPermissions: data.customPermissions as Permission[],
            }),
            ...(rolesUpdate && { roles: rolesUpdate }),
          },
          include: { roles: true },
        })

        await cache.invalidateUser(id)
        const { password: _, ...userWithoutPassword } = updated
        return userWithoutPassword as any
      }
    ),

    deleteUser: Protect(
      [Permission.USER_DELETE],
      async (_parent, { id }, { ownerId, client }) => {
        const target = await client.user.findFirst({ where: { id, ownerId } })
        if (!target) throw new NotFoundError('User not found')

        await client.user.delete({ where: { id } })
        await cache.invalidateUser(id)
        return true
      }
    ),

    assignRolesToUser: Protect(
      [Permission.USER_UPDATE],
      async (_parent, { userId, roleIds }, { ownerId, client }) => {
        const target = await client.user.findFirst({ where: { id: userId, ownerId } })
        if (!target) throw new NotFoundError('User not found')

        const roles = await client.role.findMany({
          where: { id: { in: roleIds }, ownerId },
        })
        if (roles.length !== roleIds.length) {
          throw new ValidationError('One or more role IDs are invalid')
        }

        const updated = await client.user.update({
          where: { id: userId },
          data: { roles: { connect: roleIds.map((id: string) => ({ id })) } },
          include: { roles: true },
        })

        await cache.invalidateUser(userId)
        const { password: _, ...userWithoutPassword } = updated
        return userWithoutPassword as any
      }
    ),

    removeRolesFromUser: Protect(
      [Permission.USER_UPDATE],
      async (_parent, { userId, roleIds }, { ownerId, client }) => {
        const target = await client.user.findFirst({ where: { id: userId, ownerId } })
        if (!target) throw new NotFoundError('User not found')

        const updated = await client.user.update({
          where: { id: userId },
          data: { roles: { disconnect: roleIds.map((id: string) => ({ id })) } },
          include: { roles: true },
        })

        await cache.invalidateUser(userId)
        const { password: _, ...userWithoutPassword } = updated
        return userWithoutPassword as any
      }
    ),
  },
}
