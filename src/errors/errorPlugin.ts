import { ErrorCode } from './index'
import { IS_DEVELOPMENT } from '@/constants'
import { GraphQLError, ExecutionResult } from 'graphql'
import { MercuriusContext } from 'mercurius'

/**
 * Known error codes that should be passed through to the client as-is.
 */
const KNOWN_ERROR_CODES = Object.values(ErrorCode)

/**
 * Check if an error has a known error code.
 */
const isKnownError = (error: GraphQLError): boolean => {
  const code = error.extensions?.code as string
  return KNOWN_ERROR_CODES.includes(code as ErrorCode)
}

/**
 * Format a single GraphQL error for client response.
 * In production, masks internal errors to prevent information leakage.
 */
const formatSingleError = (error: GraphQLError): GraphQLError => {
  // In development, include full error details
  if (IS_DEVELOPMENT) {
    return new GraphQLError(error.message, {
      nodes: error.nodes,
      source: error.source,
      positions: error.positions,
      path: error.path,
      originalError: error.originalError,
      extensions: {
        ...error.extensions,
        stacktrace: error.stack?.split('\n'),
      },
    })
  }

  // In production, mask unknown/internal errors
  if (!isKnownError(error)) {
    return new GraphQLError('An unexpected error occurred', {
      extensions: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
      },
    })
  }

  // Return known errors as-is (without stack trace)
  const { stacktrace, ...safeExtensions } = error.extensions || {}
  return new GraphQLError(error.message, {
    nodes: error.nodes,
    source: error.source,
    positions: error.positions,
    path: error.path,
    extensions: safeExtensions,
  })
}

/**
 * Mercurius error formatter function.
 * Replaces Apollo Server's formatError and errorHandlingPlugin.
 */
export const mercuriusFormatError = (
  execution: ExecutionResult,
  context: MercuriusContext
): { statusCode: number; response: ExecutionResult } => {
  // Log errors
  if (execution.errors) {
    for (const error of execution.errors) {
      if (IS_DEVELOPMENT) {
        context.app.log.error(
          {
            message: error.message,
            code: error.extensions?.code,
            path: error.path,
            stack: error.stack,
          },
          '[GraphQL Error]'
        )
      } else if (!isKnownError(error)) {
        context.app.log.error(
          {
            message: error.message,
            path: error.path,
            stack: error.stack,
          },
          '[Internal Error]'
        )
      }
    }
  }

  return {
    statusCode: 200,
    response: {
      data: execution.data ?? null,
      errors: execution.errors?.map(formatSingleError),
    },
  }
}

// Legacy export for backwards compatibility with the formatError signature
export const formatError = formatSingleError
