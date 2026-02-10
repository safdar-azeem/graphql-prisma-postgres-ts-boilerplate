import { STORAGE_SERVICE_URL } from '@/constants'
import type {
  StorageFile,
  StorageFolder,
  SignedUploadUrlResponse,
  PaginatedFiles,
  PaginatedFolders,
  RequestUploadInput,
  CreateFolderInput,
  PaginationInput,
  FilesFilterInput,
  FolderFilterInput,
  ShareLinkInput,
  ResourceShareLink,
} from '../types/upload.types'

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

class StorageBridgeService {
  private baseUrl: string
  private timeout: number

  constructor() {
    this.baseUrl = STORAGE_SERVICE_URL
    this.timeout = 30000
  }

  private async request<T>(
    method: string,
    endpoint: string,
    token: string,
    body?: unknown
  ): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(`${this.baseUrl}/api${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // Handle 204 No Content (Deletion success)
      if (response.status === 204) {
        return true as unknown as T
      }

      const data = (await response.json()) as ApiResponse<T>

      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`)
      }

      if (!data.success) {
        throw new Error(data.error || 'Request failed')
      }

      return data.data as T
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Storage service request timeout')
      }
      throw error
    }
  }

  async requestUploadUrl(
    input: RequestUploadInput,
    token: string
  ): Promise<SignedUploadUrlResponse> {
    return this.request<SignedUploadUrlResponse>('POST', '/upload/signed-url', token, input)
  }

  async confirmUpload(fileId: string, token: string): Promise<StorageFile> {
    return this.request<StorageFile>('POST', '/upload/confirm', token, { fileId })
  }

  async cancelUpload(fileId: string, token: string): Promise<boolean> {
    await this.request<{ cancelled: boolean }>('POST', '/upload/cancel', token, { fileId })
    return true
  }

  async getFile(id: string, token: string): Promise<StorageFile | null> {
    try {
      return await this.request<StorageFile>('GET', `/files/${id}`, token)
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null
      }
      throw error
    }
  }

  async getFiles(
    filter: FilesFilterInput | null | undefined,
    pagination: PaginationInput | undefined,
    token: string
  ): Promise<PaginatedFiles> {
    const params = new URLSearchParams()

    // Pagination
    if (pagination?.page) {
      params.set('page', pagination.page.toString())
    }
    if (pagination?.limit) {
      params.set('limit', pagination.limit.toString())
    }

    // Filters
    if (filter?.folderId !== undefined) {
      params.set('folderId', filter.folderId === null ? 'null' : filter.folderId)
    }
    if (filter?.search) {
      params.set('search', filter.search)
    }
    if (filter?.uploadedBy) {
      params.set('uploadedBy', filter.uploadedBy)
    }
    if (filter?.dateRange?.from) {
      params.set('dateFrom', filter.dateRange.from)
    }
    if (filter?.dateRange?.to) {
      params.set('dateTo', filter.dateRange.to)
    }

    const query = params.toString()
    return this.request<PaginatedFiles>('GET', `/files${query ? `?${query}` : ''}`, token)
  }

  async getFileDownloadUrl(id: string, token: string): Promise<string> {
    const result = await this.request<{ url: string }>('GET', `/files/${id}/url`, token)
    return result.url
  }

  async deleteFiles(ids: string[], token: string): Promise<string> {
    const result = await this.request<{ message: string }>('DELETE', '/files/batch', token, { ids })
    return result.message
  }

  async toggleFilePublic(id: string, token: string): Promise<StorageFile> {
    return this.request<StorageFile>('PATCH', `/files/${id}/toggle-public`, token)
  }

  async createFolder(input: CreateFolderInput, token: string): Promise<StorageFolder> {
    return this.request<StorageFolder>('POST', '/folders', token, input)
  }

  async getFolder(id: string, token: string): Promise<StorageFolder | null> {
    try {
      return await this.request<StorageFolder>('GET', `/folders/${id}`, token)
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null
      }
      throw error
    }
  }

  async getFolders(
    filter: FolderFilterInput | null | undefined,
    pagination: PaginationInput | undefined,
    token: string
  ): Promise<PaginatedFolders> {
    const params = new URLSearchParams()

    // Pagination
    if (pagination?.page) {
      params.set('page', pagination.page.toString())
    }
    if (pagination?.limit) {
      params.set('limit', pagination.limit.toString())
    }

    // Filters
    if (filter?.parentId !== undefined) {
      params.set('parentId', filter.parentId === null ? 'null' : filter.parentId)
    }
    if (filter?.search) {
      params.set('search', filter.search)
    }

    const query = params.toString()
    return this.request<PaginatedFolders>('GET', `/folders${query ? `?${query}` : ''}`, token)
  }

  async renameFolder(id: string, name: string, token: string): Promise<StorageFolder> {
    return this.request<StorageFolder>('PATCH', `/folders/${id}`, token, { name })
  }

  async moveFolder(id: string, parentId: string | null, token: string): Promise<StorageFolder> {
    return this.request<StorageFolder>('PATCH', `/folders/${id}`, token, { parentId })
  }

  async deleteFolder(id: string, token: string): Promise<boolean> {
    await this.request<void>('DELETE', `/folders/${id}`, token)
    return true
  }

  // Share link methods
  async createShareLink(input: ShareLinkInput, token: string): Promise<ResourceShareLink> {
    return this.request<ResourceShareLink>('POST', '/share-links', token, input)
  }

  async getFileShareLinks(fileId: string, token: string): Promise<ResourceShareLink[]> {
    return this.request<ResourceShareLink[]>('GET', `/share-links/file/${fileId}`, token)
  }

  async getFolderShareLinks(folderId: string, token: string): Promise<ResourceShareLink[]> {
    return this.request<ResourceShareLink[]>('GET', `/share-links/folder/${folderId}`, token)
  }

  async deleteShareLink(id: string, token: string): Promise<boolean> {
    await this.request<void>('DELETE', `/share-links/${id}`, token)
    return true
  }
}

export const storageBridge = new StorageBridgeService()
