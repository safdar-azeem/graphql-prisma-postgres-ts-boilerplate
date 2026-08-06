import Fastify, { type FastifyInstance } from 'fastify'
import mercurius from 'mercurius'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import helmet from '@fastify/helmet'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { resolvers } from '@/modules/index'
import { Context } from '@/types/context.type'
import { typeDefs } from '@/types/typeDefs.generated'
import {
  IS_DEVELOPMENT,
  TRUST_PROXY,
  ENABLE_QUEUE_DASHBOARD,
  QUEUE_DASHBOARD_TOKEN,
  ALLOW_BATCHED_QUERIES,
  GRAPHQL_QUERY_DEPTH,
  ENABLE_QUEUES,
} from '@/constants'
import { createContext, getCorsOptions, getRateLimitOptions } from '@/middleware'
import { mercuriusFormatError } from '@/errors/errorPlugin'
import { checkDatabaseReady } from '@/config/prisma'
import { isRedisHealthy } from '@/config/redis'
import { loggerOptions } from '@/config/logger'
import { getActiveQueues } from '@/queues'
import { isQueueDashboardAuthorized } from '@/queues/dashboard-auth'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { FastifyAdapter } from '@bull-board/fastify'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions as any,
    trustProxy: TRUST_PROXY,
    bodyLimit: parseInt(process.env.BODY_LIMIT_BYTES || `${1_000_000}`, 10),
  })

  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  })

  await app.register(helmet, {
    contentSecurityPolicy: IS_DEVELOPMENT ? false : undefined,
    crossOriginEmbedderPolicy: IS_DEVELOPMENT ? false : undefined,
  })

  await app.register(rateLimit, getRateLimitOptions())
  await app.register(cors, getCorsOptions())

  if (ENABLE_QUEUES && ENABLE_QUEUE_DASHBOARD) {
    if (!QUEUE_DASHBOARD_TOKEN) {
      throw new Error('QUEUE_DASHBOARD_TOKEN is required when ENABLE_QUEUE_DASHBOARD=true')
    }

    const activeQueues = getActiveQueues()
    if (activeQueues.length > 0) {
      const serverAdapter = new FastifyAdapter()
      createBullBoard({
        queues: activeQueues.map((queue) => new BullMQAdapter(queue)),
        serverAdapter,
      })
      serverAdapter.setBasePath('/admin/queues')

      await app.register(
        async (instance) => {
          instance.addHook('onRequest', async (request, reply) => {
            if (
              !isQueueDashboardAuthorized(
                request.headers['x-queue-dashboard-token'],
                QUEUE_DASHBOARD_TOKEN
              )
            ) {
              return reply.code(401).send({ error: 'Unauthorized' })
            }
          })
          await instance.register(serverAdapter.registerPlugin(), { prefix: '/admin/queues' })
        },
        { prefix: '' }
      )
    }
  }

  await app.register(mercurius, {
    schema,
    graphiql: IS_DEVELOPMENT ? 'graphiql' : false,
    path: '/graphql',
    queryDepth: GRAPHQL_QUERY_DEPTH,
    allowBatchedQueries: ALLOW_BATCHED_QUERIES,
    jit: 1,
    context: async (request): Promise<Context> => {
      const token = request.headers.authorization || (request.headers.token as string)
      return createContext(token as string)
    },
    errorFormatter: mercuriusFormatError,
  })

  app.get('/health/live', async () => ({ status: 'ok' }))

  app.get('/health/ready', async (_request, reply) => {
    const db = await checkDatabaseReady()
    const redisReady = isRedisHealthy()
    const redisRequired = process.env.REDIS_REQUIRED === 'true'

    // Core readiness: control/default DATABASE_URL only (`defaultOk`).
    // Optional shard degradation is reported separately and does not force 503.
    const ready = db.defaultOk && (redisRequired ? redisReady : true)

    const payload = {
      status: ready ? 'ready' : 'not_ready',
      commitSha: process.env.COMMIT_SHA || 'unknown',
      releaseGroup: process.env.RELEASE_GROUP || 'unknown',
      checks: {
        database: db.defaultOk,
        redis: redisReady,
        // Counts only — no internal shard IDs in public response
        degradedShardCount: db.unhealthyShards.length,
      },
    }

    if (!ready) {
      return reply.code(503).send(payload)
    }
    return payload
  })

  app.get('/health', async () => ({ status: 'ok' }))

  app.get('/', async () => ({
    name: process.env.APP_NAME || 'API',
    graphql: '/graphql',
    health: {
      live: '/health/live',
      ready: '/health/ready',
    },
  }))

  return app
}
