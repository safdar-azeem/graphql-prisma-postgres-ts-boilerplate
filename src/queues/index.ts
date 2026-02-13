import { emailQueue, emailWorker } from './email.queue'
import { notificationQueue, notificationWorker } from './notification.queue'
import { dataExportQueue, dataExportWorker } from './data-export.queue'

export const queues = [emailQueue, notificationQueue, dataExportQueue]
export const workers = [emailWorker, notificationWorker, dataExportWorker]

export { emailQueue } from './email.queue'
export { notificationQueue } from './notification.queue'
export { dataExportQueue } from './data-export.queue'

export const startQueues = async () => {
  // Workers start automatically upon instantiation,
  // but we can add any specific startup logic here if needed.
  console.log('[Queues] Background workers initialized')
}

export const shutdownQueues = async () => {
  console.log('[Queues] Shutting down workers...')
  await Promise.all(workers.map((worker) => worker.close()))
  console.log('[Queues] Workers closed')

  console.log('[Queues] Closing queue connections...')
  await Promise.all(queues.map((queue) => queue.close()))
  console.log('[Queues] Queue connections closed')
}
