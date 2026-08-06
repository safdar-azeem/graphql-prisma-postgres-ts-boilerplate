import { DependencyUnavailableError, ValidationError } from '@/errors'
import { logDependencyFailure } from '@/config/logger'

/** Map storage-bridge failures to stable public errors; log only safe fields. */
export function mapUploadError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof ValidationError || error instanceof DependencyUnavailableError) {
    return error
  }

  logDependencyFailure({
    dependency: 'storage-service',
    operation: 'bridge',
    error,
  })

  const message = error instanceof Error ? error.message : String(error)

  if (/validation|invalid|not found|unauthorized|forbidden/i.test(message)) {
    return new ValidationError(fallbackMessage)
  }

  return new DependencyUnavailableError(fallbackMessage)
}
