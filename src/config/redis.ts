import { redisClient, connectResilientRedis, isRedisHealthy } from './resilientRedis'

export const redis = redisClient
export const connectRedis = connectResilientRedis
export { isRedisHealthy }
