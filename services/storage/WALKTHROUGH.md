# Storage Service - Developer Walkthrough

This document provides a detailed walkthrough of the storage service architecture, implementation details, and integration patterns for developers.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Provider System](#provider-system)
3. [Upload Flow Deep Dive](#upload-flow-deep-dive)
4. [File & Folder Management](#file--folder-management)
5. [Authentication & Authorization](#authentication--authorization)
6. [Integration with Main Service](#integration-with-main-service)
7. [Testing Guide](#testing-guide)
8. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

The storage service is designed as a standalone microservice that handles all file storage operations. It communicates with the main GraphQL service via REST API calls.


```

┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │      │                 │
│  Frontend App   │────▶│  GraphQL API    │────▶│ Storage Service │
│                 │      │   (Port 4200)   │      │   (Port 4201)   │
│                 │      │                 │      │                 │
└─────────────────┘      └─────────────────┘      └────────┬────────┘
│                                                  │
│  (Uploads)                                       │ (Management)
│                                                  │
▼                                                  ▼
┌─────────────────┐                             ┌─────────────────┐
│                 │                             │                 │
│ Storage Provider│◀────────────────────────────│    PostgreSQL   │
│ (S3/Cloudinary) │                             │     Database    │
│                 │                             │                 │
└─────────────────┘                             └─────────────────┘

```

### Key Design Decisions

1. **Separate Microservice**: Allows independent scaling and deployment
2. **Pre-signed URLs**: Direct client-to-provider uploads reduce server load
3. **Provider Abstraction**: Easy to add new storage providers
4. **Shared JWT**: Uses same JWT secret as main service for seamless auth
5. **Configurable Proxying**: Can toggle between proxying file content or serving direct provider URLs via `FILE_PROXY_MODE`.

---

## Provider System

### Base Provider Interface

All storage providers implement the `BaseStorageProvider` abstract class:

```typescript
// src/providers/base.provider.ts
export abstract class BaseStorageProvider {
  abstract readonly name: string

  // Generate URL for client to upload directly to provider
  abstract generateSignedUploadUrl(
    options: GenerateUploadUrlOptions
  ): Promise<SignedUploadUrlResult>

  // Generate URL for client to download file
  abstract generateSignedDownloadUrl(
    options: GenerateDownloadUrlOptions
  ): Promise<SignedDownloadUrlResult>

  // Delete file from storage
  abstract deleteFile(key: string): Promise<void>

  // Get public URL (for public files)
  abstract getPublicUrl(key: string): string

  // Check if file exists in storage
  abstract fileExists(key: string): Promise<boolean>

  // Stream file content (used for Proxy Mode)
  abstract getFileStream(key: string): Promise<Readable>
}

```

### Provider Selection

The provider is selected based on `STORAGE_TYPE` environment variable:

```typescript
// src/providers/index.ts
export const getStorageProvider = (): BaseStorageProvider => {
  switch (STORAGE_TYPE) {
    case 's3':
      return new S3StorageProvider()
    case 'cloudinary':
      return new CloudinaryStorageProvider()
    case 'imagekit':
      return new ImageKitStorageProvider()
    case 'local':
    default:
      return new LocalStorageProvider()
  }
}

```

---

## Upload Flow Deep Dive

### Step 1: Request Signed URL

```
POST /api/upload/signed-url
{
  "filename": "photo.jpg",
  "mimeType": "image/jpeg",
  "size": 1024000
}

```

What happens:

1. Validate user authentication
2. Generate unique storage key: `{userId}/{folderPath}/{filename}_{uuid}.ext`
3. Call provider's `generateSignedUploadUrl()`
4. Create `File` record with status `PENDING`
5. Return signed URL and file ID

```typescript
// src/services/upload.service.ts
export const createSignedUploadUrl = async (input: CreateSignedUrlInput) => {
  // Generate unique key
  const storageKey = generateStorageKey(ownerId, folderPath, filename)

  // Get signed URL from provider
  const signedUrlResult = await provider.generateSignedUploadUrl({
    key: storageKey,
    contentType: mimeType,
    expiresInSeconds: SIGNED_URL_EXPIRY_SECONDS,
  })

  // Create pending file record
  const file = await prisma.file.create({
    data: {
      filename: storageKey.split('/').pop(),
      originalName: filename,
      mimeType,
      size,
      storageKey,
      provider: STORAGE_TYPE,
      status: 'PENDING',
      ownerId,
      expiresAt: signedUrlResult.expiresAt,
    },
  })

  return { signedUrl, fileId: file.id, publicUrl, storageKey, expiresAt }
}

```

### Step 2: Direct Upload to Provider

Client uploads directly to the storage provider using the signed URL.

**For S3:**

```javascript
await fetch(signedUrl, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': file.type },
})

```

**For Local Development:**

```javascript
const formData = new FormData()
formData.append('file', file)
await fetch(signedUrl, { method: 'PUT', body: formData })

```

### Step 3: Confirm Upload

```
POST /api/upload/confirm
{ "fileId": "clxyz123..." }

```

What happens:

1. Verify file ownership
2. Check file exists in storage provider
3. Update status to `UPLOADED`
4. Clear expiration timestamp

---

## File & Folder Management

### File Access Control & URL Resolution

Access control logic handles both authorization (Who can access?) and URL generation (How do they access?).

**Logic Flow:**

1. Check Database: Does file exist?
2. Check Auth: Is file public? If not, is user the owner or admin?
3. Generate URL: Based on `FILE_PROXY_MODE`.

```typescript
const resolveFileUrl = async (file: File): Promise<string> => {
  // Option A: Masked Mode (Proxy through API)
  // Used when FILE_PROXY_MODE=true
  if (FILE_PROXY_MODE) {
    // Returns: [http://api.service.com/api/files/:id/content?token=](http://api.service.com/api/files/:id/content?token=)...
    return getProxyUrl(file)
  }

  // Option B: Direct Mode (Direct Provider URL)
  // Used when FILE_PROXY_MODE=false
  const provider = getStorageProvider()

  // B1. If Public, return the public CDN/Bucket URL
  if (file.isPublic) {
    return provider.getPublicUrl(file.storageKey)
  }

  // B2. If Private, generate a direct Signed URL (Time-limited)
  const { signedUrl } = await provider.generateSignedDownloadUrl({
    key: file.storageKey,
    expiresInSeconds: 3600,
  })

  return signedUrl
}

```

### Folder Path Management

Folders use a path-based structure for efficient querying:

```typescript
// Create folder path
const folderPath = buildFolderPath(parentPath, sanitizedName)
// e.g., "Documents/Invoices"

// Move folder - update all child paths
const childFolders = await prisma.folder.findMany({
  where: { path: { startsWith: `${oldPath}/` } },
})

for (const child of childFolders) {
  await prisma.folder.update({
    where: { id: child.id },
    data: { path: child.path.replace(oldPath, newPath) },
  })
}

```

---

## Authentication & Authorization

### JWT Validation

The service validates JWT tokens from the main service:

```typescript
// src/middleware/auth.middleware.ts
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    req.context = { user: null, isAuthenticated: false }
    return next()
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { _id: string; email?: string }
    req.context = {
      user: { id: decoded._id, email: decoded.email || '', role: decoded.role || 'USER' },
      isAuthenticated: true,
    }
  } catch {
    req.context = { user: null, isAuthenticated: false }
  }

  next()
}

```

---

## Integration with Main Service

### Storage Bridge Service

The main GraphQL service communicates with storage via HTTP:

```typescript
// src/modules/upload/services/storage-bridge.service.ts
class StorageBridgeService {
  private async request<T>(method: string, endpoint: string, token: string, body?: unknown) {
    const response = await fetch(`${STORAGE_SERVICE_URL}/api${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const data = await response.json()
    if (!data.success) throw new Error(data.error)
    return data.data
  }

  async requestUploadUrl(input: RequestUploadInput, token: string) {
    return this.request('POST', '/upload/signed-url', token, input)
  }
}

```

---

## Testing Guide

### Manual Testing with cURL

```bash
# Get JWT token (via main service login)
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Request signed URL
curl -X POST http://localhost:4201/api/upload/signed-url \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.txt","mimeType":"text/plain","size":100}'

# Upload file (local provider)
curl -X PUT "http://localhost:4201/api/local/upload?token=<token>" \
  -F "file=@./test.txt"

# Confirm upload
curl -X POST http://localhost:4201/api/upload/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileId":"<file-id>"}'

# List files (Check returned URL type)
curl http://localhost:4201/api/files \
  -H "Authorization: Bearer $TOKEN"

```

### Testing Different Providers

1. **Local**: Set `STORAGE_TYPE=local`, check `./uploads` directory
2. **S3**: Set S3 credentials, check bucket in AWS console
3. **Cloudinary**: Set credentials, check Media Library
4. **ImageKit**: Set credentials, check File Manager

---

## Best Practices

1. **Always confirm uploads** - Don't skip the confirm step
2. **Handle partial uploads** - Files without confirm remain PENDING
3. **Use folders** - Organize files for better management
4. **Set appropriate visibility** - Default to private, make public only when needed
5. **Clean up pending files** - Run cleanup job periodically

```typescript
// Periodic cleanup of expired pending files
import { cleanupExpiredPendingFiles } from './services/upload.service.js'

setInterval(
  async () => {
    const cleaned = await cleanupExpiredPendingFiles()
    console.log(`Cleaned up ${cleaned} expired pending files`)
  },
  60 * 60 * 1000
) // Every hour

```

