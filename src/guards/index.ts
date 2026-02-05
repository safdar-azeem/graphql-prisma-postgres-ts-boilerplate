import { Context } from '@/types/context.type'
import { AuthenticationError, AuthorizationError } from '@/errors'

type ResolverFn<TParent, TArgs, TResult> = (
  parent: TParent,
  args: TArgs,
  context: Context,
  info: any
) => Promise<TResult> | TResult

interface RequireAuthOptions {
  /**
   * Optional list of roles required to access this resolver.
   * If specified, user must have at least one of these roles.
   */
  roles?: string[]
}

/**
 * Higher-order function that wraps a resolver to require authentication.
 */
export function requireAuth<TParent = any, TArgs = any, TResult = any>(
  resolver: ResolverFn<TParent, TArgs, TResult>,
  options?: RequireAuthOptions
): ResolverFn<TParent, TArgs, TResult> {
  return async (parent, args, context, info) => {
    // Check if user is authenticated
    if (!context.user) {
      throw new AuthenticationError()
    }

    // Check role-based authorization if roles are specified
    if (options?.roles && options.roles.length > 0) {
      const userRole = context.user.role as string | undefined
      const hasRequiredRole = userRole && options.roles.includes(userRole)

      if (!hasRequiredRole) {
        throw new AuthorizationError(
          `This action requires one of the following roles: ${options.roles.join(', ')}`
        )
      }
    }

    // User is authenticated and authorized, proceed with the resolver
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
    // Proceed whether authenticated or not - let the resolver decide what to do
    return resolver(parent, args, context, info)
  }
}
