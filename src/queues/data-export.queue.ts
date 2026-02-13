import { Queue, Worker, Job } from 'bullmq'
import { connectionOptions } from './connection'

const QUEUE_NAME = 'data-export'

interface DataExportJobData {
  userId: string
  format: 'JSON' | 'CSV'
  email: string
}

export const dataExportQueue = new Queue<DataExportJobData>(QUEUE_NAME, {
  connection: connectionOptions,
  defaultJobOptions: {
    attempts: 1, // Exports usually shouldn't retry if they fail due to logic
    removeOnComplete: { age: 3600 }, // Keep for 1 hour
    removeOnFail: { age: 24 * 3600 },
  },
})

export const dataExportWorker = new Worker<DataExportJobData>(
  QUEUE_NAME,
  async (job: Job<DataExportJobData>) => {
    // console.log(`[DataExportQueue] Starting export for user ${job.data.userId}`)
    // Implement heavy export logic here
    await new Promise((resolve) => setTimeout(resolve, 500))
    return { url: 'https://example.com/export.json' }
  },
  {
    connection: connectionOptions,
    concurrency: 2, // Limit concurrent heavy exports
  }
)

dataExportWorker.on('failed', (job, err) => {
  console.error(`[DataExportQueue] Job ${job?.id} failed: ${err.message}`)
})
