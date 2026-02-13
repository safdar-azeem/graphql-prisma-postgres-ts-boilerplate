import { STORAGE_TYPE } from '../constants/index.js'
import { BaseStorageProvider } from './base.provider.js'
import { LocalStorageProvider } from './local.provider.js'
import { S3StorageProvider } from './s3.provider.js'
import { CloudinaryStorageProvider } from './cloudinary.provider.js'
import { ImageKitStorageProvider } from './imagekit.provider.js'

export { BaseStorageProvider } from './base.provider.js'
export { LocalStorageProvider } from './local.provider.js'
export { S3StorageProvider } from './s3.provider.js'
export { CloudinaryStorageProvider } from './cloudinary.provider.js'
export { ImageKitStorageProvider } from './imagekit.provider.js'

let providerInstance: BaseStorageProvider | null = null

export const getStorageProvider = (): BaseStorageProvider => {
  if (providerInstance) {
    return providerInstance
  }

  switch (STORAGE_TYPE) {
    case 's3':
      providerInstance = new S3StorageProvider()
      break
    case 'cloudinary':
      providerInstance = new CloudinaryStorageProvider()
      break
    case 'imagekit':
      providerInstance = new ImageKitStorageProvider()
      break
    case 'local':
    default:
      providerInstance = new LocalStorageProvider()
      break
  }

  return providerInstance
}

export const getLocalProvider = (): LocalStorageProvider | null => {
  if (STORAGE_TYPE === 'local') {
    return getStorageProvider() as LocalStorageProvider
  }
  return null
}

export const initializeProvider = async (): Promise<void> => {
  const provider = getStorageProvider()
  if (provider instanceof LocalStorageProvider) {
    await provider.initialize()
  }
}

// ARCH-1: Allow resetting the provider for testing and hot-swap
export const resetProvider = (): void => {
  providerInstance = null
}
