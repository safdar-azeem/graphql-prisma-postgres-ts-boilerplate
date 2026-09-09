import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaSharding } from 'prisma-sharding'

const shardCount = Number.parseInt(process.env.SHARD_COUNT || '1', 10)

const shards = Array.from({ length: shardCount }, (_, index) => {
  const id = `shard_${index + 1}`
  const url = process.env[`SHARD_${index + 1}_URL`]

  if (!url) {
    throw new Error(`Missing SHARD_${index + 1}_URL for configured shard ${id}`)
  }

  return { id, url }
})

export const sharding = new PrismaSharding<PrismaClient>({
  namespace: 'graphql-boilerplate-users',
  shards,
  createClient: (url) => {
    const adapter = new PrismaPg({ connectionString: url })
    return new PrismaClient({ adapter })
  },
})
