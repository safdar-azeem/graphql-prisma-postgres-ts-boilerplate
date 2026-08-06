import { describe, it, expect } from 'vitest'
import { isQueueDashboardAuthorized } from '@/queues/dashboard-auth'

describe('queue dashboard auth', () => {
  it('accepts only a matching x-queue-dashboard-token header value', () => {
    expect(isQueueDashboardAuthorized('secret', 'secret')).toBe(true)
    expect(isQueueDashboardAuthorized('wrong', 'secret')).toBe(false)
    expect(isQueueDashboardAuthorized(undefined, 'secret')).toBe(false)
    expect(isQueueDashboardAuthorized('secret', '')).toBe(false)
  })

  it('does not treat query-string tokens as authorization input', () => {
    // Callers must pass the header only — query tokens are never read here
    const queryToken = 'secret'
    expect(isQueueDashboardAuthorized(undefined, queryToken)).toBe(false)
  })
})
