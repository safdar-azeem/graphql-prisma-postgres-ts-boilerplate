import { requireAuth } from '@/guards'
import { Context } from '@/types/context.type'
import { Resolvers } from '@/types/types.generated'
import { storageBridge } from '../services/storage-bridge.service'
import { ValidationError, InternalError } from '@/errors'
import { generateToken } from '@/modules/auth'

const getInternalToken = (context: Context): string => {
  return generateToken({ _id: context.user.id, email: context.user.email })
}

export const uploadResolver: Resolvers<Context> = {
  Query: {
    getFile: requireAuth(async (_parent, { id }, context) => {
      try {
        const token = getInternalToken(context)
        const file = await storageBridge.getFile(id, token)
        if (!file) return null

        return {
          ...file,
          createdAt: new Date(file.createdAt),
          updatedAt: new Date(file.updatedAt),
        }
      } catch (error) {
        throw new InternalError(error instanceof Error ? error.message : 'Failed to fetch file')
      }
    }),

    getFiles: requireAuth(async (_parent, { filter, pagination }, context) => {
      try {
        const token = getInternalToken(context)
        const result = await storageBridge.getFiles(filter, pagination ?? undefined, token)

        return {
          items: result.items.map((file) => ({
            ...file,
            createdAt: new Date(file.createdAt),
            updatedAt: new Date(file.updatedAt),
          })),
          pageInfo: result.pageInfo,
        }
      } catch (error) {
        throw new InternalError(error instanceof Error ? error.message : 'Failed to fetch files')
      }
    }),

    getFolder: requireAuth(async (_parent, { id }, context) => {
      try {
        const token = getInternalToken(context)
        const folder = await storageBridge.getFolder(id, token)
        if (!folder) return null

        return {
          ...folder,
          createdAt: new Date(folder.createdAt),
          updatedAt: new Date(folder.updatedAt),
          files: folder.files?.map((f) => ({
            ...f,
            createdAt: new Date(f.createdAt),
            updatedAt: new Date(f.updatedAt),
          })),
          children: folder.children?.map((c) => ({
            ...c,
            createdAt: new Date(c.createdAt),
            updatedAt: new Date(c.updatedAt),
          })),
        }
      } catch (error) {
        throw new InternalError(error instanceof Error ? error.message : 'Failed to fetch folder')
      }
    }),

    getFolders: requireAuth(async (_parent, { filter, pagination }, context) => {
      try {
        const token = getInternalToken(context)
        const result = await storageBridge.getFolders(filter, pagination ?? undefined, token)

        return {
          items: result.items.map((folder) => ({
            ...folder,
            createdAt: new Date(folder.createdAt),
            updatedAt: new Date(folder.updatedAt),
          })),
          pageInfo: result.pageInfo,
        }
      } catch (error) {
        throw new InternalError(error instanceof Error ? error.message : 'Failed to fetch folders')
      }
    }),

    getFileDownloadUrl: requireAuth(async (_parent, { id }, context) => {
      try {
        const token = getInternalToken(context)
        return await storageBridge.getFileDownloadUrl(id, token)
      } catch (error) {
        throw new InternalError(
          error instanceof Error ? error.message : 'Failed to get download URL'
        )
      }
    }),

    getFileShareLinks: requireAuth(async (_parent, { fileId }, context) => {
      try {
        const token = getInternalToken(context)
        const links = await storageBridge.getFileShareLinks(fileId, token)

        return links.map((link) => ({
          ...link,
          expiresAt: new Date(link.expiresAt),
          createdAt: new Date(link.createdAt),
        }))
      } catch (error) {
        throw new InternalError(
          error instanceof Error ? error.message : 'Failed to get file share links'
        )
      }
    }),

    getFolderShareLinks: requireAuth(async (_parent, { folderId }, context) => {
      try {
        const token = getInternalToken(context)
        const links = await storageBridge.getFolderShareLinks(folderId, token)

        return links.map((link) => ({
          ...link,
          expiresAt: new Date(link.expiresAt),
          createdAt: new Date(link.createdAt),
        }))
      } catch (error) {
        throw new InternalError(
          error instanceof Error ? error.message : 'Failed to get folder share links'
        )
      }
    }),
  },

  Mutation: {
    requestUploadUrl: requireAuth(async (_parent, { input }, context) => {
      try {
        if (!input.filename || !input.mimeType || !input.size) {
          throw new ValidationError('filename, mimeType, and size are required')
        }

        const token = getInternalToken(context)
        const result = await storageBridge.requestUploadUrl(input, token)

        return {
          ...result,
          expiresAt: new Date(result.expiresAt),
        }
      } catch (error) {
        if (error instanceof ValidationError) throw error
        throw new InternalError(
          error instanceof Error ? error.message : 'Failed to request upload URL'
        )
      }
    }),

    confirmUpload: requireAuth(async (_parent, { fileId }, context) => {
      try {
        const token = getInternalToken(context)
        const file = await storageBridge.confirmUpload(fileId, token)

        return {
          ...file,
          createdAt: new Date(file.createdAt),
          updatedAt: new Date(file.updatedAt),
        }
      } catch (error) {
        throw new InternalError(error instanceof Error ? error.message : 'Failed to confirm upload')
      }
    }),

    cancelUpload: requireAuth(async (_parent, { fileId }, context) => {
      try {
        const token = getInternalToken(context)
        return await storageBridge.cancelUpload(fileId, token)
      } catch (error) {
        throw new InternalError(error instanceof Error ? error.message : 'Failed to cancel upload')
      }
    }),

    deleteFiles: requireAuth(async (_parent, { ids }, context) => {
      try {
        if (!ids || ids.length === 0) {
          throw new ValidationError('At least one file ID is required')
        }

        const token = getInternalToken(context)
        return await storageBridge.deleteFiles(ids, token)
      } catch (error) {
        if (error instanceof ValidationError) throw error
        throw new InternalError(error instanceof Error ? error.message : 'Failed to delete files')
      }
    }),

    toggleFilePublic: requireAuth(async (_parent, { id }, context) => {
      try {
        const token = getInternalToken(context)
        const file = await storageBridge.toggleFilePublic(id, token)

        return {
          ...file,
          createdAt: new Date(file.createdAt),
          updatedAt: new Date(file.updatedAt),
        }
      } catch (error) {
        throw new InternalError(
          error instanceof Error ? error.message : 'Failed to toggle file public'
        )
      }
    }),

    createFolder: requireAuth(async (_parent, { input }, context) => {
      try {
        if (!input.name) {
          throw new ValidationError('Folder name is required')
        }

        const token = getInternalToken(context)
        const folder = await storageBridge.createFolder(input, token)

        return {
          ...folder,
          createdAt: new Date(folder.createdAt),
          updatedAt: new Date(folder.updatedAt),
        }
      } catch (error) {
        if (error instanceof ValidationError) throw error
        throw new InternalError(error instanceof Error ? error.message : 'Failed to create folder')
      }
    }),

    renameFolder: requireAuth(async (_parent, { id, name }, context) => {
      try {
        if (!name) {
          throw new ValidationError('Folder name is required')
        }

        const token = getInternalToken(context)
        const folder = await storageBridge.renameFolder(id, name, token)

        return {
          ...folder,
          createdAt: new Date(folder.createdAt),
          updatedAt: new Date(folder.updatedAt),
        }
      } catch (error) {
        if (error instanceof ValidationError) throw error
        throw new InternalError(error instanceof Error ? error.message : 'Failed to rename folder')
      }
    }),

    moveFolder: requireAuth(async (_parent, { id, parentId }, context) => {
      try {
        const token = getInternalToken(context)
        const folder = await storageBridge.moveFolder(id, parentId ?? null, token)

        return {
          ...folder,
          createdAt: new Date(folder.createdAt),
          updatedAt: new Date(folder.updatedAt),
        }
      } catch (error) {
        throw new InternalError(error instanceof Error ? error.message : 'Failed to move folder')
      }
    }),

    deleteFolder: requireAuth(async (_parent, { id }, context) => {
      try {
        const token = getInternalToken(context)
        return await storageBridge.deleteFolder(id, token)
      } catch (error) {
        throw new InternalError(error instanceof Error ? error.message : 'Failed to delete folder')
      }
    }),

    createShareLink: requireAuth(async (_parent, { input }, context) => {
      try {
        if (!input.fileId && !input.folderId) {
          throw new ValidationError('Either fileId or folderId is required')
        }

        const token = getInternalToken(context)
        const shareLink = await storageBridge.createShareLink(input, token)

        return {
          ...shareLink,
          expiresAt: new Date(shareLink.expiresAt),
          createdAt: new Date(shareLink.createdAt),
        }
      } catch (error) {
        if (error instanceof ValidationError) throw error
        throw new InternalError(
          error instanceof Error ? error.message : 'Failed to create share link'
        )
      }
    }),

    deleteShareLink: requireAuth(async (_parent, { id }, context) => {
      try {
        const token = getInternalToken(context)
        return await storageBridge.deleteShareLink(id, token)
      } catch (error) {
        throw new InternalError(
          error instanceof Error ? error.message : 'Failed to delete share link'
        )
      }
    }),
  },
}
