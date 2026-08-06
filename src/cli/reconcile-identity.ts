/**
 * Operations command: reconcile RELEASE_PENDING email identity rows.
 * Missing shard users → release; surviving users → restore ACTIVE.
 *
 * Usage:
 *   yarn identity:reconcile
 *   yarn identity:reconcile --email=user@example.com --userId=<id>
 */
import 'dotenv/config'
import {
  reconcileAllReleasePending,
  reconcileReleasePending,
} from '@/identity/email-reservation.service'
import { prisma, shutdownSharding } from '@/config/prisma'

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : undefined
}

async function main() {
  const email = parseArg('email')
  const userId = parseArg('userId')

  if ((email && !userId) || (!email && userId)) {
    throw new Error('Provide both --email= and --userId=, or neither for batch cleanup')
  }

  if (email && userId) {
    const outcome = await reconcileReleasePending(email, userId)
    console.log(JSON.stringify({ mode: 'single', email, userId, outcome }))
  } else {
    const summary = await reconcileAllReleasePending()
    console.log(JSON.stringify({ mode: 'batch', ...summary }))
  }
}

main()
  .catch((error) => {
    console.error('[identity:reconcile] failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await shutdownSharding().catch(() => undefined)
    await prisma.$disconnect().catch(() => undefined)
  })
