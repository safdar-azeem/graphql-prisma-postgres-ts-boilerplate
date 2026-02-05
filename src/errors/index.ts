import { GraphQLError, GraphQLErrorExtensions } from 'graphql'

/**
 * Error codes for consistent error handling across the application.
 */
export enum ErrorCode {
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  BAD_USER_INPUT = 'BAD_USER_INPUT',
  NOT_FOUND = 'NOT_FOUND',
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

/**
 * Thrown when a user is not authenticated but authentication is required.
 * Results in HTTP 401 equivalent.
 */
export class AuthenticationError extends BaseGraphQLError {
  constructor(
    message = 'You must be logged in to perform this action',
    options?: CustomErrorOptions
  ) {
    super(message, ErrorCode.UNAUTHENTICATED, options)
  }
}

/**
 * Thrown when a user is authenticated but doesn't have permission.
 * Results in HTTP 403 equivalent.
 */
export class AuthorizationError extends BaseGraphQLError {
  constructor(
    message = 'You do not have permission to perform this action',
    options?: CustomErrorOptions
  ) {
    super(message, ErrorCode.FORBIDDEN, options)
  }
}

/**
 * Thrown when user input validation fails.
 * Results in HTTP 400 equivalent.
 */
export class ValidationError extends BaseGraphQLError {
  constructor(message: string, options?: CustomErrorOptions) {
    super(message, ErrorCode.BAD_USER_INPUT, options)
  }
}

/**
 * Thrown when a requested resource is not found.
 * Results in HTTP 404 equivalent.
 */
export class NotFoundError extends BaseGraphQLError {
  constructor(message = 'The requested resource was not found', options?: CustomErrorOptions) {
    super(message, ErrorCode.NOT_FOUND, options)
  }
}

/**
 * Thrown for unexpected server errors.
 * Results in HTTP 500 equivalent.
 */
export class InternalError extends BaseGraphQLError {
  constructor(message = 'An unexpected error occurred', options?: CustomErrorOptions) {
    super(message, ErrorCode.INTERNAL_SERVER_ERROR, options)
  }
}
