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
- 👤 **Owner-based access control** - Strict ownership enforcement on all endpoints
- 🔍 **Advanced filtering** - Search, date range, pagination
- 🎭 **Configurable URL Masking** - Toggle between Proxy Mode (Masked) and Direct Mode (S3/CDN)
- ⏰ **Automatic cleanup** - Expired pending uploads and local tokens are cleaned up
- 🛡️ **Security hardening** - CORS restrictions, CSP/X-Frame-Options on share pages, nosniff headers
- ⚡ **Performance** - Stream timeouts, ETag/304 caching, proxy URL cache, chunked transfer encoding
- 🔌 **Circuit breaker** - Gateway bridge fails fast after repeated storage service failures
- 🚪 **Graceful shutdown** - SIGTERM/SIGINT handlers drain connections and close DB

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

| Variable               | Description                                                       | Default            |
| ---------------------- | ----------------------------------------------------------------- | ------------------ |
| `DATABASE_URL`         | PostgreSQL connection string                                      | Required           |
| `PORT`                 | Service port                                                      | `4201`             |
| `JWT_SECRET`           | JWT secret (must match main service)                              | Required           |
| `STORAGE_TYPE`         | Provider: `local`, `s3`, `cloudinary`, `imagekit`                 | `local`            |
| `FILE_PROXY_MODE`      | `true` = Mask URLs (Proxy), `false` = Direct Provider URLs        | `true`             |
| `STORAGE_PUBLIC_URL`   | Public URL for share links                                        | Service URL        |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed origins (e.g., `https://app.example.com`) | `""` (open in dev) |
| `STREAM_TIMEOUT_MS`    | Stream proxy timeout in milliseconds                              | `30000`            |
| `PROXY_TOKEN_EXPIRY`   | Proxy token lifetime (ms/s/m/h format)                            | `15m`              |

### URL Masking Modes

The `FILE_PROXY_MODE` setting controls how file URLs are returned to the client:

#### Option A: Masked Mode (`true`) - Default

- **Behavior:** Returns a URL pointing to this storage service (e.g., `http://api.builto.com/api/files/:id/content?token=...`).
- **Token:** A short-lived JWT (default: 15 minutes, configurable via `PROXY_TOKEN_EXPIRY`) signed with the service's JWT secret. Encodes `fileId`, `ownerId`, and `type: file_view`.
- **Caching:** Proxy URLs are cached in-memory to avoid redundant JWT signing. Responses include `ETag` headers, supporting `304 Not Modified` for conditional requests.
- **Security:** `storageKey` and `publicUrl` are stripped from API responses to prevent bucket path leakage.
- **Headers:** `Cache-Control: private, max-age=900`, `X-Content-Type-Options: nosniff`, `ETag`.
- **Pros:**
  - Hides the underlying storage provider (S3/OBS).
  - Allows strict access control on every read (via JWT).
  - Prevents direct hotlinking to the bucket.
- **Cons:** Higher bandwidth usage on the server (streaming proxy).

#### Option B: Direct Mode (`false`)

- **Behavior:** Returns the direct URL from the provider.
  - _Public Files:_ Returns standard public URL (e.g., `https://s3.amazonaws.com/...`).
  - _Private Files:_ Returns a short-lived Signed URL.
- **Pros:** Offloads bandwidth to the storage provider/CDN.
- **Cons:** Exposes bucket URL structure; `storageKey` and `publicUrl` are visible in responses.

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
# Optional Endpoint for compatible providers (MinIO, DigitalOcean, Contabo)
AWS_S3_ENDPOINT="https://..."
AWS_S3_FORCE_PATH_STYLE="true"

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
IMAGEKIT_URL_ENDPOINT="[https://ik.imagekit.io/your-id](https://ik.imagekit.io/your-id)"

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

> **Note:** When `FILE_PROXY_MODE=true`, `publicUrl` and `storageKey` will be empty strings to prevent bucket path leakage.

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
    "items": [
      {
        "id": "...",
        "filename": "...",
        "url": "http://localhost:4201/api/files/.../content?token=..." // or direct S3 URL depending on mode
      }
    ],
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

- For **files**: Proxies/Streams content or Redirects to download
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
  "proxyMode": true,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Security

### CORS

CORS is configured via the `CORS_ALLOWED_ORIGINS` environment variable. In development mode, all origins are allowed. In production, only explicitly listed origins are permitted.

```env
# Production: restrict to your frontend domains
CORS_ALLOWED_ORIGINS="https://app.example.com,https://admin.example.com"
```

### Access Control

- All file/folder operations enforce **owner-based access control**
- `getFileById` and `getFileDownloadUrl` throw `403` if the requester is not the file owner (unless the file is public)
- Proxy content endpoints validate a short-lived JWT token specific to each file
- Share link endpoints are public but token-gated with expiry

### Security Headers

| Header                    | Applied To                 | Value                                                           |
| ------------------------- | -------------------------- | --------------------------------------------------------------- |
| `X-Content-Type-Options`  | All proxy/stream responses | `nosniff`                                                       |
| `X-Frame-Options`         | Share HTML pages           | `DENY`                                                          |
| `Content-Security-Policy` | Share HTML pages           | `default-src 'none'; style-src 'unsafe-inline'; img-src 'self'` |

### Graceful Shutdown

The service handles `SIGTERM` and `SIGINT` signals, draining active connections and disconnecting from the database before exiting. A 10-second forced shutdown timer prevents indefinite hangs.

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

## License

MIT
