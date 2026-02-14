import express from 'express'
import cors from 'cors'
import type { CorsOptions } from 'cors'
import cookieParser from 'cookie-parser'
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
import { prisma } from './config/prisma.js'

// --- SEC-2: CORS Configuration (mirrors gateway pattern) ---
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
      // Allow requests with no origin (mobile apps, curl, server-to-server)
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

  app.use(cors(getCorsOptions())) // SEC-2: Restrictive CORS
  app.use(express.json({ limit: '1mb' })) // ARCH-3: Body size limits
  app.use(express.urlencoded({ extended: true, limit: '1mb' })) // ARCH-3: Body size limits
  app.use(cookieParser()) // NEW: Enable cookie parsing for seamless image proxying

  app.use(authMiddleware)

  // SEC-6: Removed express.static('/uploads') — it was serving local files
  // without any authentication, bypassing all access control.
  // All file access now goes through the authenticated /api/files/:id/content proxy route.

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

    // Force exit after 10 seconds if connections aren't drained
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
