export interface SignedUploadUrlResult {
  signedUrl: string
  publicUrl: string
  storageKey: string
  expiresAt: Date
}

export interface SignedDownloadUrlResult {
  signedUrl: string
  expiresAt: Date
}

export interface UploadMetadata {
  width?: number
  height?: number
  duration?: number
  [key: string]: unknown
}

export interface AuthUser {
  id: string
  email: string
  role: string
}

export interface RequestContext {
  user: AuthUser | null
  isAuthenticated: boolean
}
