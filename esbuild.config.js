import esbuild from 'esbuild'

esbuild
  .build({
    entryPoints: ['src/server.ts'],
    bundle: true,
    outfile: 'dist/index.cjs', // Use .cjs extension for CommonJS
    platform: 'node',
    // format: 'cjs', // Default is cjs
    sourcemap: true,
    minify: true,
    external: ['bcrypt', 'sharp', '@prisma/client', 'prisma-sharding', 'ioredis'],
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
    },
  })
  .catch(() => process.exit(1))
