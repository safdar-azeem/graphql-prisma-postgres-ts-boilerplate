import express from 'express'
import cors from 'cors'
import routes from './routes/index.js'
import { PORT, IS_DEVELOPMENT, STORAGE_TYPE } from './constants/index.js'
import { authMiddleware } from './middleware/auth.middleware.js'
import { errorMiddleware, notFoundMiddleware } from './middleware/error.middleware.js'
import { initializeProvider, getLocalProvider } from './providers/index.js'

async function startServer() {
  await initializeProvider()

  const app = express()

  app.use(cors())
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  app.use(authMiddleware)

  if (STORAGE_TYPE === 'local') {
    const localProvider = getLocalProvider()
    if (localProvider) {
      app.use('/uploads', express.static(localProvider.getStoragePath()))
    }
  }

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      provider: STORAGE_TYPE,
      timestamp: new Date().toISOString(),
    })
  })

  app.use('/api', routes)

  app.use(notFoundMiddleware)
  app.use(errorMiddleware)

  app.listen(PORT, () => {
    console.log(`🗄️  Storage service ready at http://localhost:${PORT}`)
    console.log(`   Provider: ${STORAGE_TYPE}`)
    if (IS_DEVELOPMENT) {
      console.log(`   Health check: http://localhost:${PORT}/health`)
    }
  })
}

startServer().catch((error) => {
  console.error('Failed to start storage service:', error)
  process.exit(1)
})
