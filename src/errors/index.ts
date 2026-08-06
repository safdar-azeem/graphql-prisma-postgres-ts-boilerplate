import { GraphQLError, GraphQLErrorExtensions } from 'graphql'

/**
 * Error codes for consistent error handling across the application.
 */
export enum ErrorCode {
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  BAD_USER_INPUT = 'BAD_USER_INPUT',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  DEPENDENCY_UNAVAILABLE = 'DEPENDENCY_UNAVAILABLE',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

interface CustomErrorOptions {
  originalError?: Error
  extensions?: GraphQLErrorExtensions
}

/**
 * Base class for custom GraphQL errors with consistent formatting.
 */
class BaseGraphQLError extends GraphQLError {
  constructor(message: string, code: ErrorCode, options?: CustomErrorOptions) {
    super(message, {
      extensions: {
        code,
        ...options?.extensions,
      },
      originalError: options?.originalError,
    })
    Object.defineProperty(this, 'name', { value: this.constructor.name })
  }
}

export class AuthenticationError extends BaseGraphQLError {
  constructor(
    message = 'You must be logged in to perform this action',
    options?: CustomErrorOptions
  ) {
    super(message, ErrorCode.UNAUTHENTICATED, options)
  }
}

export class AuthorizationError extends BaseGraphQLError {
  constructor(
    message = 'You do not have permission to perform this action',
    options?: CustomErrorOptions
  ) {
    super(message, ErrorCode.FORBIDDEN, options)
  }
}

export class ValidationError extends BaseGraphQLError {
  constructor(message: string, options?: CustomErrorOptions) {
    super(message, ErrorCode.BAD_USER_INPUT, options)
  }
}

export class NotFoundError extends BaseGraphQLError {
  constructor(message = 'The requested resource was not found', options?: CustomErrorOptions) {
    super(message, ErrorCode.NOT_FOUND, options)
  }
}

export class ConflictError extends BaseGraphQLError {
  constructor(message = 'The request conflicts with the current state', options?: CustomErrorOptions) {
    super(message, ErrorCode.CONFLICT, options)
  }
}

export class RateLimitError extends BaseGraphQLError {
  constructor(message = 'Too many requests. Please try again later.', options?: CustomErrorOptions) {
    super(message, ErrorCode.RATE_LIMITED, options)
  }
}

export class DependencyUnavailableError extends BaseGraphQLError {
  constructor(
    message = 'A required dependency is temporarily unavailable',
    options?: CustomErrorOptions
  ) {
    super(message, ErrorCode.DEPENDENCY_UNAVAILABLE, options)
  }
}

export class InternalError extends BaseGraphQLError {
  constructor(message = 'An unexpected error occurred', options?: CustomErrorOptions) {
    super(message, ErrorCode.INTERNAL_SERVER_ERROR, options)
  }
}

/** Map common Prisma error codes to application errors. */
export function mapPrismaError(error: unknown): Error | null {
  if (!error || typeof error !== 'object') return null
  const code = (error as { code?: string }).code
  const meta = (error as { meta?: { target?: string[] } }).meta

  switch (code) {
    case 'P2002': {
      const fields = meta?.target?.join(', ') || 'field'
      return new ConflictError(`A record with this ${fields} already exists`)
    }
    case 'P2025':
      return new NotFoundError('The requested record was not found')
    case 'P2003':
      return new ValidationError('Referenced record does not exist or belongs to another workspace')
    case 'P1001':
    case 'P1002':
    case 'P1017':
      return new DependencyUnavailableError('Database is temporarily unavailable')
    default:
      return null
  }
}
