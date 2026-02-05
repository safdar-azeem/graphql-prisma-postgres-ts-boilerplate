import { v2 as cloudinary } from 'cloudinary'
import {
  BaseStorageProvider,
  GenerateUploadUrlOptions,
  GenerateDownloadUrlOptions,
} from './base.provider.js'
import { cloudinaryConfig } from '../config/storage.config.js'
import { SIGNED_URL_EXPIRY_SECONDS } from '../constants/index.js'
import type { SignedUploadUrlResult, SignedDownloadUrlResult } from '../types/index.js'

export class CloudinaryStorageProvider extends BaseStorageProvider {
  readonly name = 'cloudinary'

  constructor() {
    super()
    cloudinary.config({
      cloud_name: cloudinaryConfig.cloudName,
      api_key: cloudinaryConfig.apiKey,
      api_secret: cloudinaryConfig.apiSecret,
    })
  }

  async generateSignedUploadUrl(options: GenerateUploadUrlOptions): Promise<SignedUploadUrlResult> {
    const { key, expiresInSeconds = SIGNED_URL_EXPIRY_SECONDS } = options

    const timestamp = Math.floor(Date.now() / 1000)
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000)

    const folder = key.substring(0, key.lastIndexOf('/'))
    const publicId = key.substring(key.lastIndexOf('/') + 1).replace(/\.[^/.]+$/, '')

    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp,
        folder,
        public_id: publicId,
      },
      cloudinaryConfig.apiSecret
    )

    const signedUrl = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/auto/upload`

    const publicUrl = cloudinary.url(key, {
      secure: true,
    })

    return {
      signedUrl: JSON.stringify({
        url: signedUrl,
        params: {
          api_key: cloudinaryConfig.apiKey,
          timestamp,
          signature,
          folder,
          public_id: publicId,
        },
      }),
      publicUrl,
      storageKey: key,
      expiresAt,
    }
  }

  async generateSignedDownloadUrl(
    options: GenerateDownloadUrlOptions
  ): Promise<SignedDownloadUrlResult> {
    const { key, expiresInSeconds = SIGNED_URL_EXPIRY_SECONDS } = options

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000)
    const expirationTimestamp = Math.floor(expiresAt.getTime() / 1000)

    const signedUrl = cloudinary.url(key, {
      secure: true,
      sign_url: true,
      type: 'authenticated',
      expires_at: expirationTimestamp,
    })

    return { signedUrl, expiresAt }
  }

  async deleteFile(key: string): Promise<void> {
    const publicId = key.replace(/\.[^/.]+$/, '')
    await cloudinary.uploader.destroy(publicId)
  }

  getPublicUrl(key: string): string {
    return cloudinary.url(key, { secure: true })
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      const publicId = key.replace(/\.[^/.]+$/, '')
      await cloudinary.api.resource(publicId)
      return true
    } catch (error: unknown) {
      const err = error as { http_code?: number }
      if (err.http_code === 404) {
        return false
      }
      throw error
    }
  }
}
