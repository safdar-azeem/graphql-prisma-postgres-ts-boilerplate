import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mapUploadError } from '@/modules/upload/utils/upload-errors'
import { DependencyUnavailableError, ValidationError } from '@/errors'
import * as Logger from '@/config/logger'

vi.mock('@/config/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/logger')>()
  return {
    ...actual,
    logDependencyFailure: vi.fn(),
    getAppLogger: vi.fn(() => null),
  }
})

describe('mapUploadError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('masks internal storage errors from clients', () => {
    const err = mapUploadError(new Error('ECONNREFUSED 127.0.0.1:4201 secret=abc'), 'Failed')
    expect(err).toBeInstanceOf(DependencyUnavailableError)
    expect(err.message).toBe('Failed')
    expect(err.message).not.toContain('secret')
  })

  it('does not write raw secret-bearing messages to stderr', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    mapUploadError(
      new Error('ECONNREFUSED secret=abc Authorization: Bearer tok123 token=xyz'),
      'Failed'
    )

    const logged = writeSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logged).not.toMatch(/secret=abc/i)
    expect(logged).not.toMatch(/Bearer tok123/i)
    expect(logged).not.toMatch(/token=xyz/i)

    expect(Logger.logDependencyFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        dependency: 'storage-service',
        operation: 'bridge',
      })
    )
    writeSpy.mockRestore()
  })

  it('preserves ValidationError instances', () => {
    const original = new ValidationError('bad input')
    expect(mapUploadError(original, 'Failed')).toBe(original)
  })
})
