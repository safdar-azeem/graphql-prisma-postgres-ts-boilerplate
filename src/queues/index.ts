import { ENABLE_QUEUES } from '@/constants'
import { initEmailQueue, getEmailQueue } from './email.queue'
import {
  getQueueHandles,
  isQueuesInitialized,
  markQueuesInitialized,
  resetQueueRegistryForTests,
} from './registry'

export { getEmailQueue, initEmailQueue, sendEmailDirect } from './email.queue'
export { resetQueueRegistryForTests, isQueuesInitialized }

/**
 * Explicitly initialize optional queue infrastructure.
 * No Queue/Worker/Redis resources are created when ENABLE_QUEUES is false.
 */
export const startQueues = async (): Promise<void> => {
  if (!ENABLE_QUEUES) return
  if (isQueuesInitialized()) return

  initEmailQueue()
  markQueuesInitialized()
}

export const shutdownQueues = async (): Promise<void> => {
  const handles = getQueueHandles()
  await Promise.all(handles.map((h) => (h.worker ? h.worker.close() : Promise.resolve())))
  await Promise.all(handles.map((h) => h.queue.close()))
  resetQueueRegistryForTests()
}

/** Bull Board adapters — only after startQueues(). */
export const getActiveQueues = () => getQueueHandles().map((h) => h.queue)
