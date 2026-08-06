import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('optional queues', () => {
  const original = process.env.ENABLE_QUEUES

  beforeEach(() => {
    process.env.ENABLE_QUEUES = 'false'
    // Reset module registry between runs
    vi.resetModules()
  })

  afterEach(() => {
    process.env.ENABLE_QUEUES = original
  })

  it('does not create queue or worker connections when queues are disabled', async () => {
    const queues = await import('@/queues')
    await queues.startQueues()

    expect(queues.isQueuesInitialized()).toBe(false)
    expect(queues.getEmailQueue()).toBeNull()
    expect(queues.getActiveQueues()).toEqual([])

    await queues.shutdownQueues()
  })
})
