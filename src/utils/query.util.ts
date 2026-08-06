export interface PaginationOptions {
  page?: number | null
  limit?: number | null
}

export interface DateRangeOptions {
  from?: string | Date | null
  to?: string | Date | null
}

export type SortDirection = 'asc' | 'desc'

export interface SortOptions {
  field?: string | null
  direction?: SortDirection | null
}

const DEFAULT_MAX_LIMIT = 100
const DEFAULT_LIMIT = 10

/**
 * Standardizes pagination logic for Prisma queries.
 */
export const getPagination = (
  pagination?: PaginationOptions | null,
  maxLimit = DEFAULT_MAX_LIMIT
) => {
  const page = Math.max(1, pagination?.page ?? 1)
  const limit = Math.min(maxLimit, Math.max(1, pagination?.limit ?? DEFAULT_LIMIT))
  const skip = (page - 1) * limit
  return { page, limit, skip }
}

/**
 * Standardizes pagination info response payload.
 */
export const getPageInfo = (totalItems: number, limit: number, page: number) => {
  return {
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / limit),
    currentPage: page,
  }
}

/**
 * Utility to generate a Prisma Date Range filter.
 */
export const getDateRangeFilter = (dateRange?: DateRangeOptions | null) => {
  if (!dateRange?.from && !dateRange?.to) return undefined
  const filter: Record<string, Date> = {}
  if (dateRange.from) filter.gte = new Date(dateRange.from)
  if (dateRange.to) filter.lte = new Date(dateRange.to)
  return filter
}

/**
 * Build a safe Prisma orderBy from an allow-listed sort field.
 * Always appends `id` as a stable secondary sort.
 */
export const getSafeOrderBy = <TField extends string>(
  sort: SortOptions | null | undefined,
  allowedFields: readonly TField[],
  defaultField: TField,
  defaultDirection: SortDirection = 'desc'
): Array<Record<string, SortDirection>> => {
  const hasValidField = Boolean(
    sort?.field && allowedFields.includes(sort.field as TField)
  )
  const field = (hasValidField ? sort!.field : defaultField) as TField
  // Rejected/unsafe fields also discard the requested direction
  const direction: SortDirection =
    hasValidField && (sort?.direction === 'asc' || sort?.direction === 'desc')
      ? sort.direction
      : defaultDirection

  if (field === 'id') {
    return [{ id: direction }]
  }
  return [{ [field]: direction }, { id: 'asc' }] as Array<Record<string, SortDirection>>
}
