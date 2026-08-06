/** Header-only queue dashboard auth. Query tokens are never accepted. */
export function isQueueDashboardAuthorized(
  header: string | string[] | undefined,
  expectedToken: string
): boolean {
  if (!expectedToken) return false
  const value = Array.isArray(header) ? header[0] : header
  return value === expectedToken
}
