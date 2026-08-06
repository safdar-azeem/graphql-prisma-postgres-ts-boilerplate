import { UserStatus, UserType, WorkspaceStatus } from '@prisma/client'
import { Context } from '@/types/context.type'
import { AuthenticationError, AuthorizationError } from '@/errors'
import type { PermissionId } from '@/authorization/permissions'

type ResolverFn<TParent, TArgs, TResult> = (
  parent: TParent,
  args: TArgs,
  context: Context,
  info: any
) => Promise<TResult> | TResult

interface ProtectOptions {
  requireAll?: boolean
  allow2faPending?: boolean
}

interface RequireAuthOptions {
  roles?: UserType[]
  allow2faPending?: boolean
  allowSuspendedUser?: boolean
  allowInactiveWorkspace?: boolean
}

function assertAuthenticated(
  context: Context,
  options?: {
    allow2faPending?: boolean
    allowSuspendedUser?: boolean
    allowInactiveWorkspace?: boolean
  }
) {
  if (!context.user || !context.isAuthenticated || !context.client || !context.workspaceId) {
    throw new AuthenticationError()
  }

  if (context.is2faPending && !options?.allow2faPending) {
    throw new AuthenticationError('Multi-factor authentication is required to complete this action')
  }

  // Fail closed: status must be explicitly ACTIVE
  if (!options?.allowSuspendedUser) {
    if (context.userStatus !== UserStatus.ACTIVE) {
      throw new AuthorizationError('Your account is not active')
    }
  }

  if (!options?.allowInactiveWorkspace) {
    if (context.workspaceStatus !== WorkspaceStatus.ACTIVE) {
      throw new AuthorizationError('This workspace is not active')
    }
  }
}

export function Protect<TParent = any, TArgs = any, TResult = any>(
  permissions: PermissionId[],
  resolver: ResolverFn<TParent, TArgs, TResult>,
  options?: ProtectOptions
): ResolverFn<TParent, TArgs, TResult> {
  return async (parent, args, context, info) => {
    assertAuthenticated(context, { allow2faPending: options?.allow2faPending })

    if (context.userType === UserType.OWNER) {
      return resolver(parent, args, context, info)
    }

    if (permissions.length > 0) {
      const userPerms = context.permissions
      const requireAll = options?.requireAll ?? false
      const hasAccess = requireAll
        ? permissions.every((p) => userPerms.includes(p))
        : permissions.some((p) => userPerms.includes(p))
      if (!hasAccess) {
        throw new AuthorizationError()
      }
    }

    return resolver(parent, args, context, info)
  }
}

export function requireAuth<TParent = any, TArgs = any, TResult = any>(
  resolver: ResolverFn<TParent, TArgs, TResult>,
  options?: RequireAuthOptions
): ResolverFn<TParent, TArgs, TResult> {
  return async (parent, args, context, info) => {
    assertAuthenticated(context, {
      allow2faPending: options?.allow2faPending,
      allowSuspendedUser: options?.allowSuspendedUser,
      allowInactiveWorkspace: options?.allowInactiveWorkspace,
    })

    if (options?.roles && options.roles.length > 0) {
      const hasRequiredRole = options.roles.includes(context.userType as UserType)
      if (!hasRequiredRole) {
        throw new AuthorizationError(
          `This action requires one of the following roles: ${options.roles.join(', ')}`
        )
      }
    }

    return resolver(parent, args, context, info)
  }
}

export function withOptionalAuth<TParent = any, TArgs = any, TResult = any>(
  resolver: ResolverFn<TParent, TArgs, TResult>
): ResolverFn<TParent, TArgs, TResult> {
  return async (parent, args, context, info) => {
    return resolver(parent, args, context, info)
  }
}
