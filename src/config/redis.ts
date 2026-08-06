import {
  redisClient,
  connectResilientRedis,
  disconnectResilientRedis,
  isRedisHealthy,
} from './resilientRedis'

export const redis = redisClient
export const connectRedis = connectResilientRedis
export const disconnectRedis = disconnectResilientRedis
export { isRedisHealthy }
