import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  S3ClientConfig,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  BaseStorageProvider,
  GenerateUploadUrlOptions,
  GenerateDownloadUrlOptions,
} from './base.provider.js'
import { s3Config } from '../config/storage.config.js'
import { SIGNED_URL_EXPIRY_SECONDS } from '../constants/index.js'
import type { SignedUploadUrlResult, SignedDownloadUrlResult } from '../types/index.js'

export class S3StorageProvider extends BaseStorageProvider {
  readonly name = 's3'
  private client: S3Client
  private bucket: string

  constructor() {
    super()
    
    const config: S3ClientConfig = {
      region: s3Config.region,
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
      },
    }

    // Add endpoint configuration if exists
    if (s3Config.endpoint) {
      config.endpoint = s3Config.endpoint
      config.forcePathStyle = s3Config.forcePathStyle
    }

    this.client = new S3Client(config)
    this.bucket = s3Config.bucket
  }

  async generateSignedUploadUrl(options: GenerateUploadUrlOptions): Promise<SignedUploadUrlResult> {
    const { key, contentType, expiresInSeconds = SIGNED_URL_EXPIRY_SECONDS } = options

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
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

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })

    const signedUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    })

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000)

    return { signedUrl, expiresAt }
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })

    await this.client.send(command)
  }

  getPublicUrl(key: string): string {
    // If using a custom endpoint
    if (s3Config.endpoint) {
      const endpoint = s3Config.endpoint.replace(/\/$/, '')
      
      // Path Style: https://endpoint/bucket/key (Common for generic S3/MinIO)
      if (s3Config.forcePathStyle) {
        return `${endpoint}/${this.bucket}/${key}`
      }
      
      // Virtual Hosted Style: https://bucket.endpoint/key (AWS Standard)
      // We parse the protocol to construct the URL correctly
      try {
        const urlObj = new URL(endpoint)
        return `${urlObj.protocol}//${this.bucket}.${urlObj.host}/${key}`
      } catch {
        // Fallback if parsing fails
        return `${endpoint}/${this.bucket}/${key}`
      }
    }

    // Standard AWS URL format
    return `https://${this.bucket}.s3.${s3Config.region}.amazonaws.com/${key}`
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
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
}

