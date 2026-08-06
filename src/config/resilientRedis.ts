import Redis from 'ioredis'

const redisTlsEnabled = process.env.REDIS_TLS === 'true'
const redisTlsInsecure = process.env.REDIS_TLS_INSECURE === 'true'

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
      retryStrategy: (times) => Math.min(times * 200, 5000),
      lazyConnect: true,
      enableReadyCheck: true,
      tls: redisTlsEnabled
        ? { rejectUnauthorized: !redisTlsInsecure }
        : undefined,
    })

    this.setupListeners()
  }

  private setupListeners() {
    this.client.on('connect', () => {
      this.isConnected = false
    })

    this.client.on('ready', () => {
      this.isConnected = true
    })

    this.client.on('error', () => {
      this.isConnected = false
    })

    this.client.on('close', () => {
      this.isConnected = false
    })

    this.client.on('reconnecting', () => {
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
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.client.quit()
    } catch {
      this.client.disconnect()
    }
  }
}

export const resilientRedis = ResilientRedis.getInstance()
export const redisClient = resilientRedis.client
export const isRedisHealthy = () => resilientRedis.isHealthy()
export const connectResilientRedis = () => resilientRedis.connect()
export const disconnectResilientRedis = () => resilientRedis.disconnect()
