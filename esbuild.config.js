import esbuild from 'esbuild'

esbuild
  .build({
    entryPoints: ['src/server.ts'],
    bundle: true,
    outfile: 'dist/index.js',
    platform: 'node',
    format: 'esm', // Force ESM output
    sourcemap: true,
    minify: true,
    banner: {
      js: `
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`,
    },
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
    },
  })
  .catch(() => process.exit(1))
