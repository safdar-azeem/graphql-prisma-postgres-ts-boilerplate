import { describe, it, expect } from 'vitest'
import { getPagination, getPageInfo, getSafeOrderBy } from '@/utils/query.util'

describe('query.util', () => {
  it('clamps pagination and prevents negative offsets', () => {
    expect(getPagination({ page: -1, limit: -5 })).toEqual({ page: 1, limit: 1, skip: 0 })
    expect(getPagination({ page: 2, limit: 500 }).limit).toBe(100)
  })

  it('handles empty connections', () => {
    expect(getPageInfo(0, 10, 1)).toEqual({ totalItems: 0, totalPages: 0, currentPage: 1 })
  })

  it('rejects unsafe sort fields and adds stable secondary sort', () => {
    const orderBy = getSafeOrderBy(
      { field: 'password', direction: 'asc' },
      ['name', 'createdAt', 'id'] as const,
      'createdAt',
      'desc'
    )
    expect(orderBy[0]).toEqual({ createdAt: 'desc' })
    expect(orderBy[1]).toEqual({ id: 'asc' })
  })
})
