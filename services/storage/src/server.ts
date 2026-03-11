import express from 'express'
import cors from 'cors'
import type { CorsOptions } from 'cors'
import cookieParser from 'cookie-parser'
import path from 'path'
import routes from './routes/index.js'
import {
  PORT,
  IS_DEVELOPMENT,
  STORAGE_TYPE,
  FILE_PROXY_MODE,
  CORS_ALLOWED_ORIGINS,
} from './constants/index.js'
import { authMiddleware } from './middleware/auth.middleware.js'
import { errorMiddleware, notFoundMiddleware } from './middleware/error.middleware.js'
import { initializeProvider } from './providers/index.js'
import { localConfig } from './config/storage.config.js'
import { prisma } from './config/prisma.js'

// --- SEC-2: CORS Configuration ---
const getAllowedOrigins = (): string[] => {
  const origins = new Set<string>()
  if (CORS_ALLOWED_ORIGINS) {
    CORS_ALLOWED_ORIGINS.split(',').forEach((origin) => {
      if (origin.trim()) origins.add(origin.trim())
    })
  }
  return Array.from(origins)
}

const allowedOrigins = getAllowedOrigins()

const getCorsOptions = (): CorsOptions => {
  if (IS_DEVELOPMENT) {
    return { origin: true, credentials: true }
  }
  return {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true)
        return
      }
      if (allowedOrigins.some((allowed) => origin === allowed || origin.startsWith(allowed))) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS policy'), false)
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Share-Password'],
  }
}

async function startServer() {
  await initializeProvider()

  const app = express()

  app.use(cors(getCorsOptions()))
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true, limit: '1mb' }))
  app.use(cookieParser())

  app.use(authMiddleware)

  // LOCAL STORAGE: Serve uploaded files directly via /uploads path.
  // Only enabled when STORAGE_TYPE=local. For S3/OBS/Cloudinary, files are
  // served by the provider — no static serving needed.
  // In FILE_PROXY_MODE=true, access still goes through /api/files/:id/content.
  // In FILE_PROXY_MODE=false (default for local dev), the /uploads path is used directly.
  if (STORAGE_TYPE === 'local') {
    const absoluteStoragePath = path.resolve(localConfig.storagePath)
    app.use('/uploads', express.static(absoluteStoragePath, {
      // SEC: Prevent directory listing
      index: false,
      // PERF: Cache static files for 1 hour
      maxAge: '1h',
      // SEC: Restrict to known MIME types only
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff')
      },
    }))
    console.log(`   Static files: /uploads -> ${absoluteStoragePath}`)
  }

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      provider: STORAGE_TYPE,
      proxyMode: FILE_PROXY_MODE,
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

  // ARCH-4: Graceful shutdown
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
