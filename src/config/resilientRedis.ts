import Redis from 'ioredis'

class ResilientRedis {
  private static instance: ResilientRedis
  public client: Redis
  private isConnected: boolean = false

  private constructor() {
    const REDIS_HOST = process.env.REDIS_HOST || 'localhost'
    const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10)
    const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined

    this.client = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        // Retry practically forever, but with backoff
        // If we stop retrying, ioredis emits 'end' and we can't reconnect easily without manual intervention
        return Math.min(times * 200, 5000)
      },
      lazyConnect: true,
      enableReadyCheck: true,
      tls: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    })

    this.setupListeners()
  }

  private setupListeners() {
    this.client.on('connect', () => {
      console.log('[Redis] Connection established')
    })

    this.client.on('ready', () => {
      console.log('[Redis] Ready to accept commands')
      this.isConnected = true
    })

    this.client.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message)
      this.isConnected = false
    })

    this.client.on('close', () => {
      console.warn('[Redis] Connection closed')
      this.isConnected = false
    })

    this.client.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...')
      this.isConnected = false
    })
  }

  public static getInstance(): ResilientRedis {
    if (!ResilientRedis.instance) {
      ResilientRedis.instance = new ResilientRedis()
    }
    return ResilientRedis.instance
  }

  public isHealthy(): boolean {
    return this.isConnected
  }

  public async connect(): Promise<void> {
    try {
      await this.client.connect()
    } catch (error: any) {
      console.error('[Redis] Initial connection failed:', error.message)
      // We don't throw here to allow app to start even if Redis is down
    }
  }
}

export const resilientRedis = ResilientRedis.getInstance()
export const redisClient = resilientRedis.client
export const isRedisHealthy = () => resilientRedis.isHealthy()
export const connectResilientRedis = () => resilientRedis.connect()
