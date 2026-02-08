import Fastify from 'fastify'
import mercurius from 'mercurius'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { resolvers } from '@/modules/index'
import { connectRedis } from '@/config/redis'
import { Context } from '@/types/context.type'
import { typeDefs } from '@/types/typeDefs.generated'
import { INSTANCE_ID, ENABLE_LOGER, IS_DEVELOPMENT } from '@/constants'
import { createContext, getCorsOptions, getRateLimitOptions } from '@/middleware'
import { initializeSharding, shutdownSharding } from '@/config/prisma'
import { mercuriusFormatError } from '@/errors/errorPlugin'

async function startServer() {
  const app = Fastify({
    logger: ENABLE_LOGER,
    // Trust Nginx proxy to get correct client IP for rate limiting
    // This allows X-Real-IP and X-Forwarded-For to populate request.ip
    trustProxy: true,
  })

  await connectRedis()
  await initializeSharding()

  // Build executable schema
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  })

  // Register Rate Limit plugin
  // Must be registered before routes/graphql to ensure it wraps them
  await app.register(rateLimit, getRateLimitOptions())

  // Register CORS plugin
  await app.register(cors, getCorsOptions())

  // Register Mercurius GraphQL
  await app.register(mercurius, {
    schema,
    graphiql: IS_DEVELOPMENT ? 'graphiql' : false,
    path: '/graphql',
    context: async (request): Promise<Context> => {
      const token = request.headers.authorization || (request.headers.token as string)
      return createContext(token)
    },
    errorFormatter: mercuriusFormatError,
  })

  // Health check endpoints
  app.get('/', async (request) => {
    app.log.info(`[${INSTANCE_ID}] Handling request from ${request.ip}`)
    return `Hello from ${INSTANCE_ID}`
  })

  app.get('/health', async () => {
    return 'OK'
  })

  // Graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    app.log.info(`${signal} received. Starting graceful shutdown...`)

    try {
      await app.close()
      app.log.info('HTTP server closed')

      await shutdownSharding()
      app.log.info('Database connections closed')

      process.exit(0)
    } catch (err) {
      app.log.error('Error during graceful shutdown:', err as any)
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))

  const port = parseInt(process.env.PORT || '4200', 10)
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`🚀 Server ready at http://localhost:${port}/graphql`)
}

startServer().catch((e) => {
  console.error(e)
  process.exit(1)
})
