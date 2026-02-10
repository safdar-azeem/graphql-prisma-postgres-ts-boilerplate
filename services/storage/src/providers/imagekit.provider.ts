import ImageKit from 'imagekit'
import {
  BaseStorageProvider,
  GenerateUploadUrlOptions,
  GenerateDownloadUrlOptions,
} from './base.provider.js'
import { imagekitConfig } from '../config/storage.config.js'
import { SIGNED_URL_EXPIRY_SECONDS } from '../constants/index.js'
import type { SignedUploadUrlResult, SignedDownloadUrlResult } from '../types/index.js'

export class ImageKitStorageProvider extends BaseStorageProvider {
  readonly name = 'imagekit'
  private imagekit: ImageKit

  constructor() {
    super()
    this.imagekit = new ImageKit({
      publicKey: imagekitConfig.publicKey,
      privateKey: imagekitConfig.privateKey,
      urlEndpoint: imagekitConfig.urlEndpoint,
    })
  }

  async generateSignedUploadUrl(options: GenerateUploadUrlOptions): Promise<SignedUploadUrlResult> {
    const { key, expiresInSeconds = SIGNED_URL_EXPIRY_SECONDS } = options
    const authParams = this.imagekit.getAuthenticationParameters()
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000)
    const folder = key.substring(0, key.lastIndexOf('/'))
    const fileName = key.substring(key.lastIndexOf('/') + 1)
    const publicUrl = `${imagekitConfig.urlEndpoint}/${key}`

    return {
      signedUrl: JSON.stringify({
        url: 'https://upload.imagekit.io/api/v1/files/upload',
        params: {
          ...authParams,
          fileName,
          folder: `/${folder}`,
          publicKey: imagekitConfig.publicKey,
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
    const signedUrl = this.imagekit.url({
      path: `/${key}`,
      signed: true,
      expireSeconds: expirationTimestamp,
    })
    return { signedUrl, expiresAt }
  }

  async deleteFile(key: string): Promise<void> {
    const files = await this.imagekit.listFiles({ path: `/${key}` })
    if (files.length > 0) {
      await this.imagekit.deleteFile(files[0].fileId)
    }
  }

  getPublicUrl(key: string): string {
    return `${imagekitConfig.urlEndpoint}/${key}`
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      const files = await this.imagekit.listFiles({ path: `/${key}` })
      return files.length > 0
    } catch {
      return false
    }
  }

  async setFileVisibility(_key: string, _isPublic: boolean): Promise<void> {
    // ImageKit manages visibility via private/public setting on the folder/file level in dashboard
    return
  }
}

