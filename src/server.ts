import { validateRuntimeSecrets, ENABLE_QUEUES } from '@/constants'
import { buildApp } from '@/app'
import { connectRedis, disconnectRedis } from '@/config/redis'
import { initializeSharding, shutdownSharding } from '@/config/prisma'
import { startQueues, shutdownQueues } from '@/queues'

async function startServer() {
  validateRuntimeSecrets()

  await connectRedis()
  await initializeSharding()
  await startQueues()

  const app = await buildApp()

  const gracefulShutdown = async (signal: string) => {
    app.log.info(`${signal} received. Starting graceful shutdown...`)

    try {
      await app.close()
      app.log.info('HTTP server closed')

      await shutdownQueues()
      app.log.info('Job queues closed')

      await disconnectRedis()
      app.log.info('Redis closed')

      await shutdownSharding()
      app.log.info('Database connections closed')

      process.exit(0)
    } catch (err) {
      app.log.error({ err }, 'Error during graceful shutdown')
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM')
  })
  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT')
  })

  const port = parseInt(process.env.PORT || '4200', 10)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(
    {
      port,
      queuesEnabled: ENABLE_QUEUES,
    },
    `Server ready at http://localhost:${port}/graphql`
  )
}

startServer().catch((e) => {
  console.error(e)
  process.exit(1)
})
