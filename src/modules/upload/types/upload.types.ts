export interface StorageFile {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  status: 'PENDING' | 'UPLOADED' | 'FAILED' | 'DELETED'
  url?: string | null
  folderId?: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export interface StorageFolder {
  id: string
  name: string
  path: string
  parentId?: string | null
  isPublic: boolean
  files?: StorageFile[]
  children?: StorageFolder[]
  createdAt: string
  updatedAt: string
}

export interface SignedUploadUrlResponse {
  signedUrl: string
  fileId: string
  publicUrl: string
  storageKey: string
  expiresAt: string
}

export interface PaginationInfo {
  currentPage: number
  totalPages: number
  totalItems: number
}

export interface PaginatedFiles {
  items: StorageFile[]
  pageInfo: PaginationInfo
}

export interface PaginatedFolders {
  items: StorageFolder[]
  pageInfo: PaginationInfo
}

export interface ResourceShareLink {
  id: string
  token: string
  url: string
  fileId?: string | null
  folderId?: string | null
  expiresAt: string
  createdAt: string
}

export interface RequestUploadInput {
  filename: string
  mimeType: string
  size: number
  folderId?: string | null
  folderName?: string | null
  isPublic?: boolean
}

export interface CreateFolderInput {
  name: string
  parentId?: string | null
  isPublic?: boolean
}

export interface PaginationInput {
  page?: number
  limit?: number
}

export interface DateRangeInput {
  from?: string | null
  to?: string | null
}

export interface FilesFilterInput {
  search?: string | null
  uploadedBy?: string | null
  dateRange?: DateRangeInput | null
  folderId?: string | null
}

export interface FolderFilterInput {
  search?: string | null
  parentId?: string | null
}

export interface ShareLinkInput {
  fileId?: string | null
  folderId?: string | null
  expiresInMinutes?: number | null
}
