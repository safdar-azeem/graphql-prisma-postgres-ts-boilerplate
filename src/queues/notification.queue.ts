import { Queue, Worker, Job } from 'bullmq'
import { connectionOptions } from './connection'

const QUEUE_NAME = 'notification'

interface NotificationJobData {
  userId: string
  type: 'PUSH' | 'IN_APP'
  title: string
  body: string
  payload?: any
}

export const notificationQueue = new Queue<NotificationJobData>(QUEUE_NAME, {
  connection: connectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
})

export const notificationWorker = new Worker<NotificationJobData>(
  QUEUE_NAME,
  async (job: Job<NotificationJobData>) => {
    // console.log(`[NotificationQueue] Processing notification for user ${job.data.userId}`)
    // Implement push notification logic here
    await new Promise((resolve) => setTimeout(resolve, 100))
    return { sent: true }
  },
  {
    connection: connectionOptions,
  }
)

notificationWorker.on('failed', (job, err) => {
  console.error(`[NotificationQueue] Job ${job?.id} failed: ${err.message}`)
})
