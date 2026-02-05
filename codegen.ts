import type { CodegenConfig } from '@graphql-codegen/cli'
import { defineConfig } from '@eddeee888/gcg-typescript-resolver-files'

const config = {
  overwrite: true,
  schema: ['./src/graphql/**/*.graphql', './src/modules/**/*.graphql'],
  generates: {
    './src/types': {
      ...defineConfig(),
      presetConfig: {
        ...defineConfig().presetConfig,
        resolverGeneration: 'disabled',
        mergeSchema: false,
      },
    },
  },
  hooks: {
    afterAllFileWrite: ['yarn prettier --write'],
  },
} satisfies CodegenConfig

export default config
