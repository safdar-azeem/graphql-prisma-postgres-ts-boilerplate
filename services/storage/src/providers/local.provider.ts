import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import {
  BaseStorageProvider,
  GenerateUploadUrlOptions,
  GenerateDownloadUrlOptions,
} from './base.provider.js'
import { localConfig } from '../config/storage.config.js'
import { SIGNED_URL_EXPIRY_SECONDS, PORT } from '../constants/index.js'
import type { SignedUploadUrlResult, SignedDownloadUrlResult } from '../types/index.js'
import type { Readable } from 'stream'

const signedTokens = new Map<
  string,
  { key: string; expiresAt: Date; type: 'upload' | 'download' }
>()

// SEC-6: Periodic cleanup of expired tokens to prevent unbounded memory growth
const TOKEN_CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
setInterval(() => {
  const now = new Date()
  let cleaned = 0
  for (const [token, data] of signedTokens) {
    if (data.expiresAt < now) {
      signedTokens.delete(token)
      cleaned++
    }
  }
  if (cleaned > 0) {
    console.log(
      `[LocalProvider] Cleaned up ${cleaned} expired token(s). Active: ${signedTokens.size}`
    )
  }
}, TOKEN_CLEANUP_INTERVAL_MS).unref() // unref() prevents this timer from keeping the process alive

export class LocalStorageProvider extends BaseStorageProvider {
  readonly name = 'local'
  private storagePath: string
  private storageUrl: string
  private apiUrl: string

  constructor() {
    super()
    this.storagePath = localConfig.storagePath
    this.storageUrl = localConfig.storageUrl
    const baseUrl = this.storageUrl.replace(/\/uploads\/?$/, '')
    this.apiUrl = baseUrl || `http://localhost:${PORT}`
  }

  async initialize(): Promise<void> {
    await fsPromises.mkdir(this.storagePath, { recursive: true })
  }

  async generateSignedUploadUrl(options: GenerateUploadUrlOptions): Promise<SignedUploadUrlResult> {
    const { key, expiresInSeconds = SIGNED_URL_EXPIRY_SECONDS } = options
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000)
    signedTokens.set(token, { key, expiresAt, type: 'upload' })
    const signedUrl = `${this.apiUrl}/api/local/upload?token=${token}`
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
    const signedUrl = `${this.apiUrl}/api/local/download?token=${token}`
    return { signedUrl, expiresAt }
  }

  async deleteFile(key: string): Promise<void> {
    const filePath = path.join(this.storagePath, key)
    try {
      await fsPromises.unlink(filePath)
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
      await fsPromises.access(filePath)
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

  async getFilePath(key: string): Promise<string> {
    return path.join(this.storagePath, key)
  }

  async ensureDir(filePath: string): Promise<void> {
    const dir = path.dirname(filePath)
    await fsPromises.mkdir(dir, { recursive: true })
  }

  async saveFile(key: string, buffer: Buffer): Promise<void> {
    const filePath = await this.getFilePath(key)
    await this.ensureDir(filePath)
    await fsPromises.writeFile(filePath, buffer)
  }

  getStoragePath(): string {
    return this.storagePath
  }

  async setFileVisibility(_key: string, _isPublic: boolean): Promise<void> {
    return
  }

  async getFileStream(key: string): Promise<Readable> {
    const filePath = await this.getFilePath(key)
    if (!(await this.fileExists(key))) {
      throw new Error('File not found')
    }
    return fs.createReadStream(filePath)
  }
}
