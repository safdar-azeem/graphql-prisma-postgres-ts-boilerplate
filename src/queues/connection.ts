import { ConnectionOptions } from 'bullmq'

const REDIS_HOST = process.env.REDIS_HOST || 'localhost'
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10)
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined
const redisTlsEnabled = process.env.REDIS_TLS === 'true'
const redisTlsInsecure = process.env.REDIS_TLS_INSECURE === 'true'

export const connectionOptions: ConnectionOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  tls: redisTlsEnabled ? { rejectUnauthorized: !redisTlsInsecure } : undefined,
}
