import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import CustomReporter from './test-reporter'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    env: {
      MFA_ENCRYPTION_KEY: '12345678901234567890123456789012',
      JWT_SECRET: 'test-secret',
    },
    reporters: [new CustomReporter()],
  },
})
