import type { Queue, Worker } from 'bullmq'

export type QueueHandle = {
  queue: Queue
  worker: Worker | null
}

let initialized = false
const handles: QueueHandle[] = []

export function isQueuesInitialized(): boolean {
  return initialized
}

export function registerQueueHandle(handle: QueueHandle): void {
  handles.push(handle)
}

export function markQueuesInitialized(): void {
  initialized = true
}

export function getQueueHandles(): QueueHandle[] {
  return handles
}

export function resetQueueRegistryForTests(): void {
  initialized = false
  handles.length = 0
}
