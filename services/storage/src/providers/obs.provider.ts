import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectAclCommand,
  S3ClientConfig,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  BaseStorageProvider,
  GenerateUploadUrlOptions,
  GenerateDownloadUrlOptions,
} from './base.provider.js'
import { obsConfig } from '../config/storage.config.js'
import { SIGNED_URL_EXPIRY_SECONDS } from '../constants/index.js'
import type { SignedUploadUrlResult, SignedDownloadUrlResult } from '../types/index.js'
import type { Readable } from 'stream'

export class ObsStorageProvider extends BaseStorageProvider {
  readonly name = 'obs'
  private client: S3Client
  private bucket: string
  private basePath: string
  private domainName: string

  constructor() {
    super()

    let region = 'me-east-1'
    try {
      if (obsConfig.endpoint) {
        const url = new URL(obsConfig.endpoint)
        const parts = url.hostname.split('.')
        if (parts.length > 1 && parts[0] === 'obs') {
          region = parts[1]
        }
      }
    } catch {
      // Fallback
    }

    const config: S3ClientConfig = {
      region,
      credentials: {
        accessKeyId: obsConfig.accessKeyId,
        secretAccessKey: obsConfig.secretAccessKey,
      },
      endpoint: obsConfig.endpoint,
      forcePathStyle: false, // Fix: Use Virtual-Hosted style to resolve OBS CORS OPTIONS preflight block
      requestChecksumCalculation: 'WHEN_REQUIRED', // Fix: Prevent Huawei OBS signature mismatch
      responseChecksumValidation: 'WHEN_REQUIRED',
    }

    this.client = new S3Client(config)
    this.bucket = obsConfig.bucket
    this.basePath = obsConfig.basePath
    this.domainName = obsConfig.domainName
  }

  private getFullPath(key: string): string {
    if (!this.basePath) return key
    return `${this.basePath}/${key}`.replace(/\/+/g, '/')
  }

  async generateSignedUploadUrl(options: GenerateUploadUrlOptions): Promise<SignedUploadUrlResult> {
    const { key, contentType, expiresInSeconds = SIGNED_URL_EXPIRY_SECONDS } = options
    const actualKey = this.getFullPath(key)

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: actualKey,
      ContentType: contentType,
    })

    const signedUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    })

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000)
    const publicUrl = this.getPublicUrl(key)

    return { signedUrl, publicUrl, storageKey: key, expiresAt }
  }

  async generateSignedDownloadUrl(
    options: GenerateDownloadUrlOptions
  ): Promise<SignedDownloadUrlResult> {
    const { key, expiresInSeconds = SIGNED_URL_EXPIRY_SECONDS } = options
    const actualKey = this.getFullPath(key)

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: actualKey,
    })

    const signedUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    })

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000)

    return { signedUrl, expiresAt }
  }

  async deleteFile(key: string): Promise<void> {
    const actualKey = this.getFullPath(key)
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: actualKey,
    })

    await this.client.send(command)
  }

  getPublicUrl(key: string): string {
    const actualKey = this.getFullPath(key)

    if (this.domainName) {
      const baseUrl = this.domainName.startsWith('http') 
        ? this.domainName 
        : `https://${this.domainName}`
      return `${baseUrl.replace(/\/$/, '')}/${actualKey}`
    }

    const endpoint = obsConfig.endpoint.replace(/\/$/, '')
    
    try {
      const urlObj = new URL(endpoint)
      return `${urlObj.protocol}//${this.bucket}.${urlObj.host}/${actualKey}`
    } catch {
      return `${endpoint}/${this.bucket}/${actualKey}`
    }
  }

  async fileExists(key: string): Promise<boolean> {
    const actualKey = this.getFullPath(key)
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: actualKey,
      })
      await this.client.send(command)
      return true
    } catch (error: unknown) {
      const err = error as { name?: string; $metadata?: { httpStatusCode?: number } }
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false
      }
      throw error
    }
  }

  async setFileVisibility(key: string, isPublic: boolean): Promise<void> {
    const actualKey = this.getFullPath(key)
    try {
      const command = new PutObjectAclCommand({
        Bucket: this.bucket,
        Key: actualKey,
        ACL: isPublic ? 'public-read' : 'private',
      })
      await this.client.send(command)
    } catch (error) {
      console.error('[OBS] Failed to set file visibility:', error)
    }
  }

  async getFileStream(key: string): Promise<Readable> {
    const actualKey = this.getFullPath(key)
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: actualKey,
    })
    const response = await this.client.send(command)
    return response.Body as Readable
  }
}
