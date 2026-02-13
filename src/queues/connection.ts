import { ConnectionOptions } from 'bullmq'
import { IS_PRODUCTION } from '@/constants'

const REDIS_HOST = process.env.REDIS_HOST || 'localhost'
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10)
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined

export const connectionOptions: ConnectionOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  tls: IS_PRODUCTION ? { rejectUnauthorized: false } : undefined,
}
