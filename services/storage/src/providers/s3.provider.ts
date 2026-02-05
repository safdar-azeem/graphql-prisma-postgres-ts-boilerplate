import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
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
    this.client = new S3Client({
      region: s3Config.region,
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
      },
    })
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
      const err = error as { name?: string }
      if (err.name === 'NotFound') {
        return false
      }
      throw error
    }
  }
}
