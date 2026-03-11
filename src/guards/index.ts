import { UserType, Permission } from '@prisma/client'
import { Context } from '@/types/context.type'
import { AuthenticationError, AuthorizationError } from '@/errors'

type ResolverFn<TParent, TArgs, TResult> = (
  parent: TParent,
  args: TArgs,
  context: Context,
  info: any
) => Promise<TResult> | TResult

interface ProtectOptions {
  /**
   * If true, the user must have ALL listed permissions.
   * If false or omitted, the user needs at least ONE of the listed permissions.
   */
  requireAll?: boolean
}

interface RequireAuthOptions {
  /**
   * Optional list of UserType values required to access this resolver.
   */
  roles?: UserType[]
}

/**
 * Higher-order function that handles Authentication and granular Authorization.
 * Bypasses permission checks if the user is an OWNER or if permissions array is empty.
 */
export function Protect<TParent = any, TArgs = any, TResult = any>(
  permissions: Permission[],
  resolver: ResolverFn<TParent, TArgs, TResult>,
  options?: ProtectOptions
): ResolverFn<TParent, TArgs, TResult> {
  return async (parent, args, context, info) => {
    // 1. Verify Authentication
    if (!context.user || !context.isAuthenticated) {
      throw new AuthenticationError()
    }
    // 2. Owner Bypass — OWNER has full access to everything
    if (context.userType === UserType.OWNER) {
      return resolver(parent, args, context, info)
    }
    // 3. Granular Permission Checks (Zero-DB — permissions already in context)
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

/**
 * Higher-order function that wraps a resolver to require authentication only.
 */
export function requireAuth<TParent = any, TArgs = any, TResult = any>(
  resolver: ResolverFn<TParent, TArgs, TResult>,
  options?: RequireAuthOptions
): ResolverFn<TParent, TArgs, TResult> {
  return async (parent, args, context, info) => {
    if (!context.user || !context.isAuthenticated) {
      throw new AuthenticationError()
    }
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

/**
 * Higher-order function that optionally provides the authenticated user.
 */
export function withOptionalAuth<TParent = any, TArgs = any, TResult = any>(
  resolver: ResolverFn<TParent, TArgs, TResult>
): ResolverFn<TParent, TArgs, TResult> {
  return async (parent, args, context, info) => {
    return resolver(parent, args, context, info)
  }
}
