/**
 * Authorization policy for GET /api/files/:id/content.
 *
 * - Public files: anonymous OK (controlled content route; not /uploads).
 * - Private files: require authenticated owner/admin, or a bound file-view token.
 * - File-view tokens are purpose-limited to their fileId only.
 */
export type FileContentAccessDecision = 'allow' | 'unauthorized' | 'forbidden'

export function evaluateFileContentAccess(input: {
  fileId: string
  isPublic: boolean
  ownerId: string
  isAuthenticated: boolean
  userId?: string
  role?: string
  fileView?: { fileId: string; ownerId: string }
}): FileContentAccessDecision {
  // Explicit public policy: anonymous OK via the controlled content route
  if (input.isPublic) {
    return 'allow'
  }

  // Purpose-limited file-view tokens may only access their bound fileId
  if (input.fileView && input.fileView.fileId !== input.fileId) {
    return 'forbidden'
  }

  if (!input.isAuthenticated || !input.userId) {
    return 'unauthorized'
  }

  if (input.ownerId === input.userId || input.role === 'ADMIN') {
    return 'allow'
  }

  return 'forbidden'
}
