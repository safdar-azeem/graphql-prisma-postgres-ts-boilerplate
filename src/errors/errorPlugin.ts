import { ErrorCode } from './index'
import { IS_DEVELOPMENT } from '@/constants'
import { Context } from '@/types/context.type'
import { GraphQLError, GraphQLFormattedError } from 'graphql'
import { ApolloServerPlugin, GraphQLRequestListener, GraphQLRequestContext } from '@apollo/server'

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
 * Format error for client response.
 * In production, masks internal errors to prevent information leakage.
 */
export const formatError = (
  formattedError: GraphQLFormattedError,
  error: unknown
): GraphQLFormattedError => {
  const originalError = error as GraphQLError

  // In development, include full error details
  if (IS_DEVELOPMENT) {
    return {
      ...formattedError,
      extensions: {
        ...formattedError.extensions,
        stacktrace: originalError.stack?.split('\n'),
      },
    }
  }

  // In production, mask unknown/internal errors
  if (!isKnownError(originalError)) {
    return {
      message: 'An unexpected error occurred',
      extensions: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
      },
    }
  }

  // Return known errors as-is (without stack trace)
  const { stacktrace, ...safeExtensions } = formattedError.extensions || {}
  return {
    ...formattedError,
    extensions: safeExtensions,
  }
}

/**
 * Apollo Server plugin for global error handling and logging.
 */
export const errorHandlingPlugin = (): ApolloServerPlugin<Context> => ({
  async requestDidStart(
    _requestContext: GraphQLRequestContext<Context>
  ): Promise<GraphQLRequestListener<Context>> {
    return {
      async didEncounterErrors(requestContext) {
        for (const error of requestContext.errors) {
          // Log all errors in development
          if (IS_DEVELOPMENT) {
            console.error('[GraphQL Error]', {
              message: error.message,
              code: error.extensions?.code,
              path: error.path,
              stack: error.stack,
            })
          } else {
            // In production, only log unknown/internal errors
            if (!isKnownError(error)) {
              console.error('[Internal Error]', {
                message: error.message,
                path: error.path,
                stack: error.stack,
              })
            }
          }
        }
      },
    }
  },
})
