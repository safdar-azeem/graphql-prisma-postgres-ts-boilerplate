# Storage Service

A modular, provider-agnostic file storage microservice built with Express, Prisma, and TypeScript. Supports multiple storage backends including AWS S3, Cloudinary, ImageKit, and local filesystem.

## Features

- 🔐 **Pre-signed URL uploads** - Secure direct-to-provider uploads
- 🔄 **Multiple providers** - S3, Cloudinary, ImageKit, Local filesystem
- 📁 **Folder management** - Create, rename, move, delete folders
- 🗃️ **File management** - Upload, download, delete with metadata tracking
- 🔗 **Share links** - Time-limited shareable links for files and folders
- 🌐 **Folder sharing** - Browse shared folders via HTML page
- 🔑 **JWT authentication** - Secure API access with shared JWT secret
- 👤 **Owner-based access control** - Files/folders are owned by users
- 🔍 **Advanced filtering** - Search, date range, pagination
- 🙈 **URL proxying** - Actual storage URLs are never exposed
- ⏰ **Automatic cleanup** - Expired pending uploads are cleaned up

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Yarn or npm

### Installation

```bash
# Install dependencies
yarn install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
```

### Database Setup

```bash
# Create database
createdb storage

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push
```

### Running

```bash
# Development
yarn dev

# Production
yarn build
yarn start
```

The service runs on `http://localhost:4201` by default.

## Configuration

### Environment Variables

| Variable             | Description                                       | Default     |
| -------------------- | ------------------------------------------------- | ----------- |
| `DATABASE_URL`       | PostgreSQL connection string                      | Required    |
| `PORT`               | Service port                                      | `4201`      |
| `JWT_SECRET`         | JWT secret (must match main service)              | Required    |
| `STORAGE_TYPE`       | Provider: `local`, `s3`, `cloudinary`, `imagekit` | `local`     |
| `STORAGE_PUBLIC_URL` | Public URL for share links                        | Service URL |

### Provider-specific Configuration

#### Local Storage (Development)

```env
STORAGE_TYPE="local"
LOCAL_STORAGE_PATH="./uploads"
LOCAL_STORAGE_URL="http://localhost:4201/uploads"
```

#### AWS S3

```env
STORAGE_TYPE="s3"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
AWS_REGION="us-east-1"
AWS_S3_BUCKET="your-bucket-name"
```

#### Cloudinary

```env
STORAGE_TYPE="cloudinary"
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"
```

#### ImageKit

```env
STORAGE_TYPE="imagekit"
IMAGEKIT_PUBLIC_KEY="your-public-key"
IMAGEKIT_PRIVATE_KEY="your-private-key"
IMAGEKIT_URL_ENDPOINT="https://ik.imagekit.io/your-id"
```

## API Reference

### Authentication

All endpoints (except share links) require a JWT token in the `Authorization` header:

```
Authorization: Bearer <jwt-token>
```

The JWT should contain:

- `_id`: User ID
- `email`: User email (optional)
- `role`: User role (optional)

### Upload Endpoints

#### Request Signed Upload URL

```http
POST /api/upload/signed-url
Content-Type: application/json

{
  "filename": "photo.jpg",
  "mimeType": "image/jpeg",
  "size": 1024000,
  "folderId": null,
  "isPublic": false
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "signedUrl": "https://...",
    "fileId": "clxyz123...",
    "publicUrl": "https://...",
    "storageKey": "user-id/photo_uuid.jpg",
    "expiresAt": "2024-01-01T12:00:00.000Z"
  }
}
```

#### Confirm Upload

```http
POST /api/upload/confirm
Content-Type: application/json

{
  "fileId": "clxyz123..."
}
```

#### Cancel Upload

```http
POST /api/upload/cancel
Content-Type: application/json

{
  "fileId": "clxyz123..."
}
```

### File Endpoints

#### List Files (with filters)

```http
GET /api/files?page=1&limit=10&search=photo&folderId=null&dateFrom=2024-01-01&dateTo=2024-12-31
```

**Query Parameters:**

| Parameter    | Description                           | Default |
| ------------ | ------------------------------------- | ------- |
| `page`       | Page number (1-indexed)               | `1`     |
| `limit`      | Items per page (max 100)              | `10`    |
| `search`     | Search in original filename           | -       |
| `folderId`   | Filter by folder ID (`null` for root) | -       |
| `uploadedBy` | Filter by uploader user ID            | -       |
| `dateFrom`   | Filter from date (ISO 8601)           | -       |
| `dateTo`     | Filter to date (ISO 8601)             | -       |

**Response:**

```json
{
  "success": true,
  "data": {
    "items": [...],
    "pageInfo": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 50
    }
  }
}
```

#### Get File

```http
GET /api/files/:id
```

#### Get Download URL

```http
GET /api/files/:id/url
```

#### Toggle File Public

```http
PATCH /api/files/:id/toggle-public
```

#### Update File

```http
PATCH /api/files/:id
Content-Type: application/json

{
  "isPublic": true
}
```

#### Delete Files (Batch)

```http
DELETE /api/files/batch
Content-Type: application/json

{
  "ids": ["file-id-1", "file-id-2"]
}
```

#### Delete Single File

```http
DELETE /api/files/:id
```

### Folder Endpoints

#### Create Folder

```http
POST /api/folders
Content-Type: application/json

{
  "name": "Documents",
  "parentId": null,
  "isPublic": false
}
```

#### List Folders (with filters)

```http
GET /api/folders?page=1&limit=10&search=docs&parentId=null
```

**Query Parameters:**

| Parameter  | Description                               | Default |
| ---------- | ----------------------------------------- | ------- |
| `page`     | Page number (1-indexed)                   | `1`     |
| `limit`    | Items per page (max 100)                  | `10`    |
| `search`   | Search in folder name                     | -       |
| `parentId` | Filter by parent folder (`null` for root) | -       |

#### Get Folder

```http
GET /api/folders/:id
```

#### Update Folder (Rename/Move)

```http
PATCH /api/folders/:id
Content-Type: application/json

{
  "name": "New Name",
  "parentId": "new-parent-id"
}
```

#### Delete Folder

```http
DELETE /api/folders/:id
```

### Share Link Endpoints (Authenticated)

#### Create Share Link

```http
POST /api/share-links
Content-Type: application/json

{
  "fileId": "file-id",
  "expiresInMinutes": 1440
}
```

or for folder:

```http
POST /api/share-links
Content-Type: application/json

{
  "folderId": "folder-id",
  "expiresInMinutes": 10080
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "share-link-id",
    "token": "abc123...",
    "url": "http://localhost:4201/api/share/abc123...",
    "expiresAt": "2024-01-08T12:00:00.000Z",
    "createdAt": "2024-01-01T12:00:00.000Z"
  }
}
```

#### Get File's Share Links

```http
GET /api/share-links/file/:fileId
```

#### Get Folder's Share Links

```http
GET /api/share-links/folder/:folderId
```

#### Delete Share Link

```http
DELETE /api/share-links/:id
```

### Public Share Endpoints (No Auth Required)

#### Access Shared Resource

```http
GET /api/share/:token
```

- For **files**: Redirects to download
- For **folders**: Returns HTML page with file listing

#### Download Shared File

```http
GET /api/share/:token/download
```

#### Download File from Shared Folder

```http
GET /api/share/:token/file/:fileId
```

#### Browse Subfolder

```http
GET /api/share/:token?path=subfolder/path
```

### Local Upload Endpoints (Development Only)

These endpoints are only available when `STORAGE_TYPE=local`.

#### Upload File

```http
PUT /api/local/upload?token=<upload-token>
Content-Type: multipart/form-data

file: <binary>
```

#### Download File

```http
GET /api/local/download?token=<download-token>
```

### Health Check

```http
GET /health
```

**Response:**

```json
{
  "status": "ok",
  "provider": "local",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Upload Flow

### For S3/Cloudinary/ImageKit

1. **Request signed URL** - Client calls `POST /api/upload/signed-url`
2. **Upload directly** - Client uploads file directly to provider using signed URL
3. **Confirm upload** - Client calls `POST /api/upload/confirm`

```javascript
// 1. Request signed URL
const { signedUrl, fileId } = await fetch('/api/upload/signed-url', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    filename: file.name,
    mimeType: file.type,
    size: file.size,
  }),
})
  .then((r) => r.json())
  .then((r) => r.data)

// 2. Upload directly to provider
await fetch(signedUrl, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': file.type },
})

// 3. Confirm upload
await fetch('/api/upload/confirm', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ fileId }),
})
```

### For Local Storage (Development)

1. **Request signed URL** - Returns a local endpoint URL with token
2. **Upload to local endpoint** - Client uploads file as multipart/form-data
3. **Confirm upload** - Same as above

```javascript
// 1. Request signed URL
const { signedUrl, fileId } = await fetch('/api/upload/signed-url', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    filename: file.name,
    mimeType: file.type,
    size: file.size,
  }),
})
  .then((r) => r.json())
  .then((r) => r.data)

// 2. Upload to local endpoint
const formData = new FormData()
formData.append('file', file)
await fetch(signedUrl, {
  method: 'PUT',
  body: formData,
})

// 3. Confirm upload
await fetch('/api/upload/confirm', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ fileId }),
})
```

## Share Links

Share links provide temporary, token-based access to files and folders without authentication.

### Creating a Share Link

```javascript
const response = await fetch('/api/share-links', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    fileId: 'file-id', // or folderId for folders
    expiresInMinutes: 1440, // 24 hours
  }),
})

const { url } = await response.json().then((r) => r.data)
// url: "http://localhost:4201/api/share/abc123..."
```

### Sharing a Folder

When sharing a folder, users receive a link to an HTML page that displays:

- Folder name and breadcrumb navigation
- List of files with download buttons
- List of subfolders with navigation links

The HTML page is styled with a modern dark theme and is fully responsive.

### URL Security

Actual storage URLs (S3, Cloudinary, etc.) are **never exposed** to end users. All downloads go through the storage service which:

1. Validates the share link token
2. Checks expiration
3. Generates a short-lived signed URL from the provider
4. Redirects the user to the signed URL

This ensures storage credentials and bucket details remain hidden.

## Project Structure

```
services/storage/
├── prisma/
│   └── schema.prisma      # Database schema
├── src/
│   ├── config/            # Configuration
│   │   ├── prisma.ts      # Prisma client
│   │   └── storage.config.ts
│   ├── constants/         # Environment constants
│   ├── middleware/        # Express middleware
│   │   ├── auth.middleware.ts
│   │   └── error.middleware.ts
│   ├── providers/         # Storage provider adapters
│   │   ├── base.provider.ts
│   │   ├── local.provider.ts
│   │   ├── s3.provider.ts
│   │   ├── cloudinary.provider.ts
│   │   └── imagekit.provider.ts
│   ├── routes/            # API routes
│   │   ├── upload.routes.ts
│   │   ├── file.routes.ts
│   │   ├── folder.routes.ts
│   │   ├── local-upload.routes.ts
│   │   ├── share-link.routes.ts   # Authenticated share link CRUD
│   │   └── share.routes.ts        # Public share access
│   ├── services/          # Business logic
│   │   ├── upload.service.ts
│   │   ├── file.service.ts
│   │   ├── folder.service.ts
│   │   └── share-link.service.ts
│   ├── types/             # TypeScript types
│   ├── utils/             # Utility functions
│   └── server.ts          # Entry point
├── generated/             # Generated Prisma client
├── .env.example           # Environment template
├── package.json
└── tsconfig.json
```

## Database Schema

### File Model

- `id` - Unique identifier (CUID)
- `filename` - Storage filename (sanitized)
- `originalName` - Original filename
- `mimeType` - File MIME type
- `size` - File size in bytes
- `storageKey` - Unique key in storage provider
- `provider` - Storage provider name
- `status` - PENDING | UPLOADED | FAILED | DELETED
- `folderId` - Parent folder (optional)
- `ownerId` - User who owns the file
- `isPublic` - Public access flag
- `metadata` - JSON metadata (optional)
- `expiresAt` - Expiry for pending files

### Folder Model

- `id` - Unique identifier (CUID)
- `name` - Folder name
- `path` - Full path (unique per owner)
- `parentId` - Parent folder (optional)
- `ownerId` - User who owns the folder
- `isPublic` - Public access flag

### ShareLink Model

- `id` - Unique identifier (CUID)
- `token` - Unique access token
- `fileId` - Linked file (optional)
- `folderId` - Linked folder (optional)
- `ownerId` - User who created the link
- `expiresAt` - Expiration timestamp
- `createdAt` - Creation timestamp

## Adding a New Provider

1. Create a new provider class in `src/providers/`:

```typescript
import { BaseStorageProvider, GenerateUploadUrlOptions } from './base.provider.js'

export class MyProvider extends BaseStorageProvider {
  readonly name = 'myprovider'

  async generateSignedUploadUrl(options: GenerateUploadUrlOptions) {
    // Implementation
  }

  async generateSignedDownloadUrl(options: GenerateDownloadUrlOptions) {
    // Implementation
  }

  async deleteFile(key: string) {
    // Implementation
  }

  getPublicUrl(key: string) {
    // Implementation
  }

  async fileExists(key: string) {
    // Implementation
  }
}
```

2. Add provider to `src/providers/index.ts`:

```typescript
case 'myprovider':
  providerInstance = new MyProvider()
  break
```

3. Add configuration to `src/config/storage.config.ts`

4. Update `STORAGE_TYPE` type in `src/constants/index.ts`

## Error Handling

All errors return a consistent format:

```json
{
  "success": false,
  "error": "Error message"
}
```

Common HTTP status codes:

- `400` - Bad request / Validation error
- `401` - Authentication required
- `403` - Access denied
- `404` - Resource not found
- `409` - Conflict (e.g., folder already exists)
- `500` - Internal server error

## Security

- **JWT Authentication** - All routes require valid JWT (except public share links)
- **Owner-based Access** - Users can only access their own files/folders
- **Public/Private Files** - `isPublic` flag controls access
- **Signed URLs** - Time-limited access to storage
- **No Direct URLs** - Original storage URLs are never exposed
- **Token-based Sharing** - Share links use secure random tokens
- **Automatic Expiration** - Share links expire automatically

## Scripts

| Command          | Description                              |
| ---------------- | ---------------------------------------- |
| `yarn dev`       | Start development server with hot reload |
| `yarn build`     | Build for production                     |
| `yarn start`     | Start production server                  |
| `yarn db:sync`   | Generate Prisma client and push schema   |
| `yarn db:studio` | Open Prisma Studio                       |

## License

MIT
