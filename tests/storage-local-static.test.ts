import { describe, it, expect, beforeAll } from 'vitest'

let shouldMountLocalStaticUploads: typeof import('../services/storage/src/utils/local-static').shouldMountLocalStaticUploads
let evaluateFileContentAccess: typeof import('../services/storage/src/utils/file-content-access').evaluateFileContentAccess

beforeAll(async () => {
  ;({ shouldMountLocalStaticUploads } = await import(
    '../services/storage/src/utils/local-static.ts'
  ))
  ;({ evaluateFileContentAccess } = await import(
    '../services/storage/src/utils/file-content-access.ts'
  ))
})

describe('local static /uploads mount policy', () => {
  it('does not mount /uploads when FILE_PROXY_MODE=true', () => {
    expect(shouldMountLocalStaticUploads('local', true)).toBe(false)
  })

  it('mounts /uploads only for local + direct (non-proxy) mode', () => {
    expect(shouldMountLocalStaticUploads('local', false)).toBe(true)
    expect(shouldMountLocalStaticUploads('s3', false)).toBe(false)
    expect(shouldMountLocalStaticUploads('s3', true)).toBe(false)
  })
})

describe('file content authorization (controlled route)', () => {
  it('denies anonymous access to private files', () => {
    expect(
      evaluateFileContentAccess({
        fileId: 'f1',
        isPublic: false,
        ownerId: 'owner-1',
        isAuthenticated: false,
      })
    ).toBe('unauthorized')
  })

  it('allows purpose-limited file-view tokens only for the bound fileId', () => {
    expect(
      evaluateFileContentAccess({
        fileId: 'f1',
        isPublic: false,
        ownerId: 'owner-1',
        isAuthenticated: true,
        userId: 'owner-1',
        fileView: { fileId: 'f1', ownerId: 'owner-1' },
      })
    ).toBe('allow')

    expect(
      evaluateFileContentAccess({
        fileId: 'f1',
        isPublic: false,
        ownerId: 'owner-1',
        isAuthenticated: true,
        userId: 'owner-1',
        fileView: { fileId: 'other', ownerId: 'owner-1' },
      })
    ).toBe('forbidden')
  })

  it('allows anonymous access only for explicitly public files', () => {
    expect(
      evaluateFileContentAccess({
        fileId: 'f1',
        isPublic: true,
        ownerId: 'owner-1',
        isAuthenticated: false,
      })
    ).toBe('allow')
  })

  it('forbids non-owner access to private files', () => {
    expect(
      evaluateFileContentAccess({
        fileId: 'f1',
        isPublic: false,
        ownerId: 'owner-1',
        isAuthenticated: true,
        userId: 'other',
        role: 'USER',
      })
    ).toBe('forbidden')
  })
})
