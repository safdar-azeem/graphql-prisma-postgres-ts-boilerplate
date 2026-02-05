import { v4 as uuidv4 } from 'uuid'
import path from 'path'

export const generateStorageKey = (
  ownerId: string,
  folderPath: string | null,
  filename: string
): string => {
  const ext = path.extname(filename)
  const uniqueId = uuidv4()
  const sanitizedFilename = path.basename(filename, ext).replace(/[^a-zA-Z0-9-_]/g, '_')
  const newFilename = `${sanitizedFilename}_${uniqueId}${ext}`

  if (folderPath) {
    return `${ownerId}/${folderPath}/${newFilename}`
  }

  return `${ownerId}/${newFilename}`
}

export const sanitizeFolderName = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9-_\s]/g, '').trim()
}

export const buildFolderPath = (parentPath: string | null, folderName: string): string => {
  const sanitized = sanitizeFolderName(folderName)
  if (parentPath) {
    return `${parentPath}/${sanitized}`
  }
  return sanitized
}

export const getFileExtension = (filename: string): string => {
  return path.extname(filename).toLowerCase()
}

export const getMimeTypeCategory = (
  mimeType: string
): 'image' | 'video' | 'audio' | 'document' | 'other' => {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (
    mimeType.includes('pdf') ||
    mimeType.includes('document') ||
    mimeType.includes('text') ||
    mimeType.includes('spreadsheet')
  ) {
    return 'document'
  }
  return 'other'
}
