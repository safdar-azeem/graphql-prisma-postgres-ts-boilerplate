import type { SignedUploadUrlResult, SignedDownloadUrlResult } from '../types/index.js'
import type { Readable } from 'stream'

export interface GenerateUploadUrlOptions {
  key: string
  contentType: string
  expiresInSeconds?: number
}

export interface GenerateDownloadUrlOptions {
  key: string
  expiresInSeconds?: number
}

export abstract class BaseStorageProvider {
  abstract readonly name: string

  abstract generateSignedUploadUrl(
    options: GenerateUploadUrlOptions
  ): Promise<SignedUploadUrlResult>

  abstract generateSignedDownloadUrl(
    options: GenerateDownloadUrlOptions
  ): Promise<SignedDownloadUrlResult>

  abstract deleteFile(key: string): Promise<void>

  abstract getPublicUrl(key: string): string

  abstract fileExists(key: string): Promise<boolean>

  abstract setFileVisibility(key: string, isPublic: boolean): Promise<void>

  // NEW: Stream file content for proxying
  abstract getFileStream(key: string): Promise<Readable>
}
