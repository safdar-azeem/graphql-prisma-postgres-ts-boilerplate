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
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  Frontend App   │────▶│  GraphQL API    │────▶│ Storage Service │
│                 │     │   (Port 4200)   │     │   (Port 4001)   │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
        │                                                │
        │                                                │
        │    ┌───────────────────────────────────────────┤
        │    │                                           │
        ▼    ▼                                           ▼
┌─────────────────┐                             ┌─────────────────┐
│                 │                             │                 │
│ Storage Provider│◀────────────────────────────│   PostgreSQL    │
│ (S3/Cloudinary) │                             │    Database     │
│                 │                             │                 │
└─────────────────┘                             └─────────────────┘
```

### Key Design Decisions

1. **Separate Microservice**: Allows independent scaling and deployment
2. **Pre-signed URLs**: Direct client-to-provider uploads reduce server load
3. **Provider Abstraction**: Easy to add new storage providers
4. **Shared JWT**: Uses same JWT secret as main service for seamless auth

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

### Provider-Specific Implementations

#### S3 Provider

Uses AWS SDK v3 with `@aws-sdk/s3-request-presigner`:

```typescript
async generateSignedUploadUrl(options: GenerateUploadUrlOptions) {
  const command = new PutObjectCommand({
    Bucket: this.bucket,
    Key: key,
    ContentType: contentType,
  })

  const signedUrl = await getSignedUrl(this.client, command, {
    expiresIn: expiresInSeconds,
  })

  return { signedUrl, publicUrl, storageKey: key, expiresAt }
}
```

#### Cloudinary Provider

Returns upload parameters instead of direct URL (Cloudinary's approach):

```typescript
async generateSignedUploadUrl(options: GenerateUploadUrlOptions) {
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder, public_id: publicId },
    cloudinaryConfig.apiSecret
  )

  // Returns JSON with URL and params for client to use
  return {
    signedUrl: JSON.stringify({
      url: 'https://api.cloudinary.com/v1_1/.../upload',
      params: { api_key, timestamp, signature, folder, public_id }
    }),
    ...
  }
}
```

#### Local Provider

Uses token-based URLs for development:

```typescript
async generateSignedUploadUrl(options: GenerateUploadUrlOptions) {
  const token = crypto.randomBytes(32).toString('hex')
  signedTokens.set(token, { key, expiresAt, type: 'upload' })

  // Client uploads to local endpoint with token
  const signedUrl = `${this.storageUrl}/upload?token=${token}`
  return { signedUrl, publicUrl, storageKey: key, expiresAt }
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

```typescript
export const confirmUpload = async (fileId: string, ownerId: string) => {
  const file = await prisma.file.findUnique({ where: { id: fileId } })

  // Verify ownership
  if (file.ownerId !== ownerId) {
    throw new Error('Access denied')
  }

  // Verify file exists in storage
  const exists = await provider.fileExists(file.storageKey)
  if (!exists) {
    await prisma.file.update({ where: { id: fileId }, data: { status: 'FAILED' } })
    throw new Error('File not found in storage')
  }

  // Mark as uploaded
  return prisma.file.update({
    where: { id: fileId },
    data: { status: 'UPLOADED', expiresAt: null },
  })
}
```

---

## File & Folder Management

### Storage Key Structure

Files are organized by user and folder:

```
{userId}/
├── file1_uuid.jpg           # Root level file
├── Documents/
│   ├── report_uuid.pdf      # File in folder
│   └── Invoices/
│       └── invoice_uuid.pdf # File in nested folder
└── Images/
    └── photo_uuid.jpg
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

### File Access Control

Files respect ownership and public flags:

```typescript
export const getFileById = async (id: string, ownerId: string) => {
  const file = await prisma.file.findUnique({ where: { id } })

  // Check access
  if (!file.isPublic && file.ownerId !== ownerId) {
    throw new Error('Access denied')
  }

  // Generate URL based on visibility
  let url: string | null = null
  if (file.status === 'UPLOADED') {
    if (file.isPublic) {
      url = provider.getPublicUrl(file.storageKey)
    } else {
      const signedUrl = await provider.generateSignedDownloadUrl({
        key: file.storageKey,
      })
      url = signedUrl.signedUrl
    }
  }

  return { ...file, url }
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

### Route Protection

Protected routes use the `requireAuth` middleware:

```typescript
router.post('/signed-url', requireAuth, async (req, res, next) => {
  const ownerId = req.context.user!.id // Safe to access after requireAuth
  // ...
})
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

### GraphQL Resolvers

Resolvers delegate to the storage bridge:

```typescript
// src/modules/upload/resolvers/upload.resolver.ts
export const uploadResolver: Resolvers<Context> = {
  Mutation: {
    requestUploadUrl: requireAuth(async (_parent, { input }, context) => {
      const token = generateToken({ _id: context.user.id, email: context.user.email })
      const result = await storageBridge.requestUploadUrl(input, token)
      return { ...result, expiresAt: new Date(result.expiresAt) }
    }),
  },
}
```

---

## Testing Guide

### Manual Testing with cURL

```bash
# Get JWT token (via main service login)
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Request signed URL
curl -X POST http://localhost:4001/api/upload/signed-url \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.txt","mimeType":"text/plain","size":100}'

# Upload file (local provider)
curl -X PUT "http://localhost:4001/api/local/upload?token=<token>" \
  -F "file=@./test.txt"

# Confirm upload
curl -X POST http://localhost:4001/api/upload/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileId":"<file-id>"}'

# List files
curl http://localhost:4001/api/files \
  -H "Authorization: Bearer $TOKEN"
```

### Testing Different Providers

1. **Local**: Set `STORAGE_TYPE=local`, check `./uploads` directory
2. **S3**: Set S3 credentials, check bucket in AWS console
3. **Cloudinary**: Set credentials, check Media Library
4. **ImageKit**: Set credentials, check File Manager

---

## Troubleshooting

### Common Issues

#### "File not found in storage" on confirm

**Cause**: File wasn't actually uploaded to provider  
**Solution**:

- Check network requests for upload errors
- Verify signed URL wasn't expired
- Check provider dashboard for upload

#### "Access denied" errors

**Cause**: JWT token invalid or user doesn't own resource  
**Solution**:

- Verify `JWT_SECRET` matches between services
- Check user ID in JWT matches file/folder owner

#### Local provider files not serving

**Cause**: Static file serving not configured correctly  
**Solution**:

- Check `LOCAL_STORAGE_PATH` exists
- Verify `LOCAL_STORAGE_URL` matches server URL

### Debug Mode

Enable detailed logging in development:

```typescript
// Errors are logged in development mode
if (IS_DEVELOPMENT) {
  console.error('[Error]', { message: err.message, stack: err.stack })
}
```

### Database Issues

```bash
# Reset database
npx prisma db push --force-reset

# View database
npx prisma studio
```

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
