export interface PaginationOptions {
  page?: number | null
  limit?: number | null
}

export interface DateRangeOptions {
  from?: string | Date | null
  to?: string | Date | null
}

/**
 * Standardizes pagination logic for Prisma queries
 */
export const getPagination = (pagination?: PaginationOptions | null) => {
  const page = Math.max(1, pagination?.page ?? 1)
  const limit = Math.min(100, Math.max(1, pagination?.limit ?? 10))
  const skip = (page - 1) * limit
  return { page, limit, skip }
}

/**
 * Standardizes pagination info response payload
 */
export const getPageInfo = (totalItems: number, limit: number, page: number) => {
  return {
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    currentPage: page,
  }
}

/**
 * Utility to generate a Prisma Date Range filter
 */
export const getDateRangeFilter = (dateRange?: DateRangeOptions | null) => {
  if (!dateRange?.from && !dateRange?.to) return undefined
  const filter: any = {}
  if (dateRange.from) filter.gte = new Date(dateRange.from)
  if (dateRange.to) filter.lte = new Date(dateRange.to)
  return filter
}
