import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import CustomReporter from './test-reporter'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const useVerbose = process.env.VITEST_REPORTER === 'verbose'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    env: {
      MFA_ENCRYPTION_KEY: '12345678901234567890123456789012',
      ACCESS_TOKEN_SECRET: 'test-access-secret-at-least-32-chars!!',
      REFRESH_TOKEN_SECRET: 'test-refresh-secret-at-least-32-chars!',
      STORAGE_SERVICE_TOKEN_SECRET: 'test-storage-secret-at-least-32-chars!',
      ENABLE_QUEUES: 'false',
    },
    reporters: useVerbose ? ['verbose'] : [new CustomReporter()],
  },
})
