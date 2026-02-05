import Redis from 'ioredis'

const REDIS_HOST = process.env.REDIS_HOST || 'localhost'
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10)
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined

export const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 3) {
      console.error('[Redis] Max retries reached, stopping reconnection')
      return null
    }
    return Math.min(times * 200, 2000)
  },
  lazyConnect: true,
  enableReadyCheck: true,
})

redis.on('connect', () => {
  console.log('[Redis] Connected successfully')
})

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message)
})

redis.on('ready', () => {
  console.log('[Redis] Ready to accept commands')
})

export const connectRedis = async (): Promise<void> => {
  try {
    await redis.connect()
  } catch (error: any) {
    console.error('[Redis] Failed to connect:', error.message)
  }
}
