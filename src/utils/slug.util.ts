/** Create a URL-safe slug from a name. */
export function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

  return base || `workspace-${Date.now().toString(36)}`
}

export function uniqueSlug(base: string, suffix?: string): string {
  const slug = slugify(base)
  if (!suffix) return slug
  return `${slug}-${suffix}`.slice(0, 64)
}
