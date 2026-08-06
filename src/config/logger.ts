import pino, { type Logger } from 'pino'
import { ENABLE_LOGGER, IS_PRODUCTION } from '@/constants'

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.token',
  'password',
  'variables.password',
  'variables.data.password',
  'variables.token',
  'variables.refreshToken',
  '*.password',
  '*.token',
  '*.refreshToken',
  '*.secret',
  'err.message',
  'error',
]

/** Fastify-compatible logger options (redaction enabled). */
export const loggerOptions = ENABLE_LOGGER
  ? {
      level: process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug'),
      redact: {
        paths: redactPaths,
        censor: '[Redacted]',
      },
    }
  : false

let appLogger: Logger | null = null

export function getAppLogger(): Logger | null {
  if (!ENABLE_LOGGER) return null
  if (!appLogger) {
    appLogger = pino(loggerOptions as pino.LoggerOptions)
  }
  return appLogger
}

const SENSITIVE_PATTERN =
  /(secret|token|password|authorization|api[_-]?key|bearer)\s*[:=]\s*\S+/gi

/** Strip query strings and credential-like substrings from free-form text. */
export function sanitizeLogText(input: string): string {
  const withoutQuery = input.replace(/[?&]([^=\s]+)=([^&\s]+)/g, (_, key) => {
    if (/token|secret|password|key|auth|sig/i.test(key)) {
      return `[redacted-${key}]`
    }
    return `[query-${key}]`
  })
  return withoutQuery.replace(SENSITIVE_PATTERN, '$1=[Redacted]')
}

export function logDependencyFailure(opts: {
  dependency: string
  operation: string
  error: unknown
  requestId?: string
}): void {
  const err = opts.error instanceof Error ? opts.error : new Error(String(opts.error))
  const payload = {
    msg: 'Dependency failure',
    dependency: opts.dependency,
    operation: opts.operation,
    errorName: err.name,
    errorCode: (err as { code?: string }).code,
    requestId: opts.requestId,
  }

  const logger = getAppLogger()
  if (logger) {
    logger.error(payload)
    return
  }

  // Fallback when logging disabled/unavailable — still never emit raw messages
  process.stderr.write(JSON.stringify({ level: 'error', ...payload }) + '\n')
}
