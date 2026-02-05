import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import {
  BaseStorageProvider,
  GenerateUploadUrlOptions,
  GenerateDownloadUrlOptions,
} from './base.provider.js'
import { localConfig } from '../config/storage.config.js'
import { SIGNED_URL_EXPIRY_SECONDS } from '../constants/index.js'
import type { SignedUploadUrlResult, SignedDownloadUrlResult } from '../types/index.js'

const signedTokens = new Map<
  string,
  { key: string; expiresAt: Date; type: 'upload' | 'download' }
>()

export class LocalStorageProvider extends BaseStorageProvider {
  readonly name = 'local'
  private storagePath: string
  private storageUrl: string

  constructor() {
    super()
    this.storagePath = localConfig.storagePath
    this.storageUrl = localConfig.storageUrl
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.storagePath, { recursive: true })
  }

  async generateSignedUploadUrl(options: GenerateUploadUrlOptions): Promise<SignedUploadUrlResult> {
    const { key, expiresInSeconds = SIGNED_URL_EXPIRY_SECONDS } = options

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000)

    signedTokens.set(token, { key, expiresAt, type: 'upload' })

    const signedUrl = `${this.storageUrl}/upload?token=${token}`
    const publicUrl = `${this.storageUrl}/${key}`

    return { signedUrl, publicUrl, storageKey: key, expiresAt }
  }

  async generateSignedDownloadUrl(
    options: GenerateDownloadUrlOptions
  ): Promise<SignedDownloadUrlResult> {
    const { key, expiresInSeconds = SIGNED_URL_EXPIRY_SECONDS } = options

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000)

    signedTokens.set(token, { key, expiresAt, type: 'download' })

    const signedUrl = `${this.storageUrl}/download?token=${token}`

    return { signedUrl, expiresAt }
  }

  async deleteFile(key: string): Promise<void> {
    const filePath = path.join(this.storagePath, key)
    try {
      await fs.unlink(filePath)
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }

  getPublicUrl(key: string): string {
    return `${this.storageUrl}/${key}`
  }

  async fileExists(key: string): Promise<boolean> {
    const filePath = path.join(this.storagePath, key)
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  validateUploadToken(token: string): { key: string } | null {
    const tokenData = signedTokens.get(token)
    if (!tokenData) return null
    if (tokenData.type !== 'upload') return null
    if (new Date() > tokenData.expiresAt) {
      signedTokens.delete(token)
      return null
    }
    return { key: tokenData.key }
  }

  validateDownloadToken(token: string): { key: string } | null {
    const tokenData = signedTokens.get(token)
    if (!tokenData) return null
    if (tokenData.type !== 'download') return null
    if (new Date() > tokenData.expiresAt) {
      signedTokens.delete(token)
      return null
    }
    return { key: tokenData.key }
  }

  consumeUploadToken(token: string): void {
    signedTokens.delete(token)
  }

  async saveFile(key: string, buffer: Buffer): Promise<void> {
    const filePath = path.join(this.storagePath, key)
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(filePath, buffer)
  }

  async getFilePath(key: string): Promise<string> {
    return path.join(this.storagePath, key)
  }

  getStoragePath(): string {
    return this.storagePath
  }
}
