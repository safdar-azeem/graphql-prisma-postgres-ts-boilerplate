import http from 'http'
import express from 'express'
import bodyParser from 'body-parser'
import { resolvers } from '@/modules/index'
import { ApolloServer } from '@apollo/server'
import { connectRedis } from '@/config/redis'
import { Context } from '@/types/context.type'
import { typeDefs } from '@/types/typeDefs.generated'
import { INSTANCE_ID, IS_DEVELOPMENT } from '@/constants'
import { createContext, corsMiddleware } from '@/middleware'
import { expressMiddleware } from '@as-integrations/express5'
import { initializeSharding, shutdownSharding } from '@/config/prisma'
import { formatError, errorHandlingPlugin } from '@/errors/errorPlugin'
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer'
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default'

async function startServer() {
  const app = express()
  const httpServer = http.createServer(app)

  await connectRedis()

  await initializeSharding()

  const server = new ApolloServer<Context>({
    typeDefs,
    resolvers,
    formatError,
    plugins: [
      IS_DEVELOPMENT ? ApolloServerPluginLandingPageLocalDefault() : {},
      ApolloServerPluginDrainHttpServer({ httpServer }),
      errorHandlingPlugin(),
    ],
  })

  await server.start()

  app.use(corsMiddleware)
  app.use(
    '/graphql',
    bodyParser.json(),
    bodyParser.urlencoded({ extended: true }),
    expressMiddleware(server, {
      context: async ({ req }: { req: express.Request }) => {
        const token = req.headers.authorization || (req.headers.token as string)
        return createContext(token)
      },
    })
  )

  app.get('/', (req, res) => {
    console.log(`[${INSTANCE_ID}] Handling request from ${req.ip}`)
    res.send(`Hello from ${INSTANCE_ID}`)
  })

  app.get('/health', (req, res) => {
    res.status(200).send('OK')
  })

  const gracefulShutdown = async (signal: string) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`)

    httpServer.close(async () => {
      console.log('HTTP server closed')

      await shutdownSharding()
      console.log('Database connections closed')

      process.exit(0)
    })

    setTimeout(() => {
      console.error('Forced shutdown due to timeout')
      process.exit(1)
    }, 10000)
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))

  const port = parseInt(process.env.PORT || '4200', 10)
  await new Promise<void>((resolve) => httpServer.listen({ port }, resolve))
  console.log(`🚀 Server ready at http://localhost:${port}/graphql`)
}

startServer().catch((e) => {
  console.error(e)
  process.exit(1)
})
