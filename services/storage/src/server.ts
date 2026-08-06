import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'path'
import routes from './routes/index.js'
import {
  PORT,
  IS_DEVELOPMENT,
  STORAGE_TYPE,
  FILE_PROXY_MODE,
  CORS_ALLOWED_ORIGINS,
  validateStorageSecrets,
} from './constants/index.js'
import { authMiddleware } from './middleware/auth.middleware.js'
import { getCorsOptions, parseAllowedOrigins } from './middleware/cors.js'
import { errorMiddleware, notFoundMiddleware } from './middleware/error.middleware.js'
import { initializeProvider } from './providers/index.js'
import { localConfig } from './config/storage.config.js'
import { prisma } from './config/prisma.js'
import { shouldMountLocalStaticUploads } from './utils/local-static.js'

async function startServer() {
  // Fail closed before provider/network initialization
  validateStorageSecrets()
  await initializeProvider()

  const app = express()
  const allowedOrigins = parseAllowedOrigins(CORS_ALLOWED_ORIGINS)

  app.use(cors(getCorsOptions()))
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true, limit: '1mb' }))
  app.use(cookieParser())

  app.use(authMiddleware)

  // Never mount /uploads in proxy mode — private files would bypass auth/file-view tokens.
  // Direct mode treats /uploads paths as publicly readable; private files must use
  // /api/files/:id/content with Authorization or a purpose-limited file-view token.
  if (shouldMountLocalStaticUploads(STORAGE_TYPE, FILE_PROXY_MODE)) {
    const absoluteStoragePath = path.resolve(localConfig.storagePath)
    app.use(
      '/uploads',
      express.static(absoluteStoragePath, {
        index: false,
        maxAge: '1h',
        setHeaders: (res) => {
          res.setHeader('X-Content-Type-Options', 'nosniff')
        },
      })
    )
    console.log(`   Static files: /uploads -> ${absoluteStoragePath} (public direct mode)`)
  } else if (STORAGE_TYPE === 'local' && FILE_PROXY_MODE) {
    console.log('   Static /uploads disabled (FILE_PROXY_MODE=true); use /api/files/:id/content')
  }

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      provider: STORAGE_TYPE,
      proxyMode: FILE_PROXY_MODE,
      localStaticUploads: shouldMountLocalStaticUploads(STORAGE_TYPE, FILE_PROXY_MODE),
      timestamp: new Date().toISOString(),
    })
  })

  app.use('/api', routes)

  app.use(notFoundMiddleware)
  app.use(errorMiddleware)

  const server = app.listen(PORT, () => {
    console.log(`🗄️  Storage service ready at http://localhost:${PORT}`)
    console.log(`   Provider: ${STORAGE_TYPE}`)
    console.log(`   URL Mode: ${FILE_PROXY_MODE ? 'MASKED (Proxy)' : 'DIRECT (Provider URL)'}`)
    console.log(
      `   CORS: ${IS_DEVELOPMENT ? 'OPEN (development)' : `Restricted (${allowedOrigins.length} origins)`}`
    )
    if (IS_DEVELOPMENT) {
      console.log(`   Health check: http://localhost:${PORT}/health`)
    }
  })

  const gracefulShutdown = async (signal: string) => {
    console.log(`\n[Storage] ${signal} received. Shutting down gracefully...`)
    server.close(async () => {
      try {
        await prisma.$disconnect()
        console.log('[Storage] Database disconnected. Goodbye.')
      } catch (err) {
        console.error('[Storage] Error during shutdown:', err)
      }
      process.exit(0)
    })

    setTimeout(() => {
      console.error('[Storage] Forced shutdown after timeout.')
      process.exit(1)
    }, 10_000)
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
}

startServer().catch((error) => {
  console.error('Failed to start storage service:', error)
  process.exit(1)
})
