export interface S3Config {
  accessKeyId: string
  secretAccessKey: string
  region: string
  bucket: string
}

export interface CloudinaryConfig {
  cloudName: string
  apiKey: string
  apiSecret: string
}

export interface ImageKitConfig {
  publicKey: string
  privateKey: string
  urlEndpoint: string
}

export interface LocalConfig {
  storagePath: string
  storageUrl: string
}

export const s3Config: S3Config = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  region: process.env.AWS_REGION || 'us-east-1',
  bucket: process.env.AWS_S3_BUCKET || '',
}

export const cloudinaryConfig: CloudinaryConfig = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  apiKey: process.env.CLOUDINARY_API_KEY || '',
  apiSecret: process.env.CLOUDINARY_API_SECRET || '',
}

export const imagekitConfig: ImageKitConfig = {
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY || '',
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY || '',
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || '',
}

export const localConfig: LocalConfig = {
  storagePath: process.env.LOCAL_STORAGE_PATH || './uploads',
  storageUrl: process.env.LOCAL_STORAGE_URL || 'http://localhost:4001/uploads',
}
