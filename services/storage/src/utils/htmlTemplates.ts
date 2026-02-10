import { PORT } from '../constants/index.js'

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

// SVG Icons
const icons = {
  folder: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,

  file: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`,

  image: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,

  pdf: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,

  video: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`,

  audio: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,

  archive: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>`,

  code: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`,

  download: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,

  chevronRight: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,

  home: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,

  alert: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,

  emptyFolder: `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
}

const getFileIcon = (mimeType: string, fileName: string): string => {
  if (mimeType.startsWith('image/')) return icons.image
  if (mimeType.includes('pdf')) return icons.pdf
  if (mimeType.startsWith('video/')) return icons.video
  if (mimeType.startsWith('audio/')) return icons.audio
  if (
    mimeType.includes('zip') ||
    mimeType.includes('rar') ||
    mimeType.includes('7z') ||
    mimeType.includes('tar')
  )
    return icons.archive

  const ext = fileName.split('.').pop()?.toLowerCase()
  if (
    ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'html', 'css', 'json', 'xml'].includes(
      ext || ''
    )
  )
    return icons.code

  return icons.file
}

export const generateSharedFolderHtml = (
  folderName: string,
  folderPath: string,
  files: { id: string; originalName: string; mimeType: string; size: number; createdAt?: Date }[],
  subfolders: { id: string; name: string }[],
  shareToken: string,
  isError: boolean = false,
  currentSubPath?: string
): string => {
  const baseUrl = process.env.STORAGE_PUBLIC_URL || `http://localhost:${PORT}`

  if (isError) {
    return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Link Expired - Shared Storage</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            display: flex; 
            align-items: center; 
            justify-content: center; 
            min-height: 100vh; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 1rem;
          }
          .error-container { 
            background: white; 
            padding: 3rem 2rem; 
            border-radius: 16px; 
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            text-align: center; 
            max-width: 400px; 
            width: 100%; 
          }
          .error-icon {
            color: #ef4444;
            margin-bottom: 1.5rem;
            animation: shake 0.5s ease-in-out;
          }
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-10px); }
            75% { transform: translateX(10px); }
          }
          h1 { 
            font-size: 1.5rem; 
            margin-bottom: 0.75rem; 
            color: #1f2937;
            font-weight: 600;
          }
          p { 
            color: #6b7280; 
            line-height: 1.6;
            font-size: 0.95rem;
          }
        </style>
      </head>
      <body>
        <div class="error-container">
          <div class="error-icon">${icons.alert}</div>
          <h1>Link Expired</h1>
          <p>The shared link you are trying to access is invalid or has expired. Please request a new link from the owner.</p>
        </div>
      </body>
    </html>`
  }

  // Breadcrumbs Logic
  const breadcrumbs = currentSubPath ? currentSubPath.split('/').filter(Boolean) : []
  let breadcrumbHtml = `<a href="${baseUrl}/api/share/${shareToken}" class="breadcrumb-item">
    <span class="breadcrumb-icon">${icons.home}</span>
    <span class="breadcrumb-text">${folderName}</span>
  </a>`

  let pathSoFar = ''
  for (const crumb of breadcrumbs) {
    pathSoFar += (pathSoFar ? '/' : '') + crumb
    breadcrumbHtml += `
      <span class="breadcrumb-separator">${icons.chevronRight}</span>
      <a href="${baseUrl}/api/share/${shareToken}?path=${encodeURIComponent(pathSoFar)}" class="breadcrumb-item">
        <span class="breadcrumb-text">${crumb}</span>
      </a>`
  }

  const fileRows = files
    .map((file) => {
      const icon = getFileIcon(file.mimeType, file.originalName)
      const dateStr = file.createdAt ? formatDate(file.createdAt) : '-'

      return `
      <tr class="table-row" onclick="window.location='${baseUrl}/api/share/${shareToken}/file/${file.id}'">
        <td class="file-cell">
          <div class="file-info">
            <div class="file-icon file-type">${icon}</div>
            <span class="file-name">${file.originalName}</span>
          </div>
        </td>
        <td class="meta-cell">${file.mimeType}</td>
        <td class="meta-cell">${formatFileSize(file.size)}</td>
        <td class="meta-cell">${dateStr}</td>
        <td class="action-cell">
          <a href="${baseUrl}/api/share/${shareToken}/file/${file.id}?download=true" 
             class="download-btn" 
             onclick="event.stopPropagation()"
             title="Download">
            ${icons.download}
            <span>Download</span>
          </a>
        </td>
      </tr>`
    })
    .join('')

  const folderRows = subfolders
    .map((folder) => {
      const subPath = currentSubPath ? `${currentSubPath}/${folder.name}` : folder.name
      return `
      <tr class="table-row folder-row" onclick="window.location='${baseUrl}/api/share/${shareToken}?path=${encodeURIComponent(subPath)}'">
        <td class="file-cell">
          <div class="file-info">
            <div class="file-icon folder-type">${icons.folder}</div>
            <span class="file-name">${folder.name}</span>
          </div>
        </td>
        <td class="meta-cell">Folder</td>
        <td class="meta-cell">-</td>
        <td class="meta-cell">-</td>
        <td class="action-cell">
          <span class="open-label">Open</span>
        </td>
      </tr>`
    })
    .join('')

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${currentSubPath ? currentSubPath.split('/').pop() : folderName} - Shared Storage</title>
  <style>
    :root {
      --primary: #000000;
      --primary-hover: #2563eb;
      --primary-light: #eff6ff;
      --bg-main: #f8fafc;
      --bg-surface: #ffffff;
      --border: #e2e8f0;
      --border-hover: #cbd5e1;
      --text-primary: #0f172a;
      --text-secondary: #64748b;
      --text-muted: #94a3b8;
      --hover-bg: #f1f5f9;
      --folder-color: #f59e0b;
      --success: #10b981;
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 12px;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg-main);
      color: var(--text-primary);
      line-height: 1.6;
      padding: 1.5rem;
      min-height: 100vh;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      border: 1px solid var(--border);
      overflow: hidden;
    }

    /* Header */
    .header {
      background: linear-gradient(to right, var(--primary), #242325);
      padding: 1.5rem 2rem;
      color: white;
    }

    .header-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .header-subtitle {
      font-size: 0.875rem;
      opacity: 0.9;
    }

    /* Breadcrumbs */
    .breadcrumbs {
      padding: 1rem 2rem;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.25rem;
      font-size: 0.9rem;
    }

    .breadcrumb-item {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.375rem 0.75rem;
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      text-decoration: none;
      font-weight: 500;
      transition: all 0.2s ease;
    }

    .breadcrumb-item:hover {
      background: var(--hover-bg);
      color: var(--primary);
    }

    .breadcrumb-item:last-child {
      color: var(--text-primary);
      font-weight: 600;
    }

    .breadcrumb-icon {
      display: flex;
      align-items: center;
      color: var(--text-muted);
    }

    .breadcrumb-separator {
      display: flex;
      align-items: center;
      color: var(--text-muted);
      opacity: 0.6;
    }

    /* Table Container */
    .table-wrapper {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    thead {
      background: var(--bg-main);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    th {
      padding: 0.875rem 1.5rem;
      text-align: left;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border);
    }

    .table-row {
      border-bottom: 1px solid var(--border);
      transition: background-color 0.15s ease;
      cursor: pointer;
    }

    .table-row:hover {
      background-color: var(--hover-bg);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    td {
      padding: 1rem 1.5rem;
      vertical-align: middle;
    }

    /* File Cell */
    .file-cell {
      font-weight: 500;
    }

    .file-info {
      display: flex;
      align-items: center;
      gap: 0.875rem;
    }

    .file-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: var(--radius-sm);
      flex-shrink: 0;
    }

    .folder-type {
      background: linear-gradient(135deg, #fbbf24 0%, var(--folder-color) 100%);
      color: white;
    }

    .file-type {
      background: var(--primary-light);
      color: var(--primary);
    }

    .file-name {
      color: var(--text-primary);
      font-size: 0.9375rem;
      word-break: break-word;
    }

    .folder-row .file-name {
      font-weight: 600;
    }

    /* Meta Cells */
    .meta-cell {
      color: var(--text-secondary);
      font-size: 0.875rem;
      white-space: nowrap;
    }

    /* Action Cell */
    .action-cell {
      text-align: right;
    }

    .download-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--primary);
      color: white;
      border-radius: var(--radius-sm);
      font-size: 0.875rem;
      font-weight: 500;
      text-decoration: none;
      transition: all 0.2s ease;
      border: none;
      cursor: pointer;
    }

    .download-btn:hover {
      background: var(--primary-hover);
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
    }

    .download-btn:active {
      transform: translateY(0);
    }

    .open-label {
      color: var(--text-muted);
      font-size: 0.8125rem;
      font-weight: 500;
    }

    /* Empty State */
    .empty-state {
      padding: 4rem 2rem;
      text-align: center;
      color: var(--text-secondary);
    }

    .empty-icon {
      color: var(--text-muted);
      margin-bottom: 1.5rem;
      opacity: 0.5;
    }

    .empty-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 0.5rem;
    }

    .empty-description {
      font-size: 0.9375rem;
      color: var(--text-secondary);
    }

    /* Stats Bar */
    .stats-bar {
      padding: 1rem 2rem;
      background: var(--bg-main);
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.8125rem;
      color: var(--text-secondary);
    }

    .stats-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    /* Responsive Design */
    @media (max-width: 768px) {
      body {
        padding: 0;
      }

      .container {
        border-radius: 0;
        border-left: none;
        border-right: none;
      }

      .header {
        padding: 1.25rem 1rem;
      }

      .breadcrumbs {
        padding: 0.75rem 1rem;
        font-size: 0.8125rem;
      }

      th, td {
        padding: 0.75rem 1rem;
      }

      .meta-cell:nth-child(3),
      .meta-cell:nth-child(4),
      th:nth-child(3),
      th:nth-child(4) {
        display: none;
      }

      .download-btn span {
        display: none;
      }

      .stats-bar {
        flex-direction: column;
        gap: 0.5rem;
        align-items: flex-start;
      }
    }

    @media (max-width: 480px) {
      .header-title {
        font-size: 1.125rem;
      }

      .file-name {
        font-size: 0.875rem;
      }

      .breadcrumb-text {
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    /* Loading Animation */
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .table-row {
      animation: fadeIn 0.3s ease;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="header-title">
        ${icons.folder}
        <span>Shared Folder</span>
      </div>
      <div class="header-subtitle">Browse and download shared files</div>
    </div>

    <!-- Breadcrumbs -->
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      ${breadcrumbHtml}
    </nav>

    <!-- Table -->
    <div class="table-wrapper">
      ${
        files.length === 0 && subfolders.length === 0
          ? `<div class="empty-state">
           <div class="empty-icon">${icons.emptyFolder}</div>
           <div class="empty-title">No files or folders</div>
           <div class="empty-description">This folder is currently empty</div>
         </div>`
          : `<table>
          <thead>
            <tr>
              <th style="width: 40%">Name</th>
              <th style="width: 20%">Type</th>
              <th style="width: 12%">Size</th>
              <th style="width: 15%">Modified</th>
              <th style="width: 13%; text-align: right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${folderRows}
            ${fileRows}
          </tbody>
        </table>`
      }
    </div>

    <!-- Stats Bar -->
    ${
      files.length > 0 || subfolders.length > 0
        ? `<div class="stats-bar">
        <div class="stats-item">
          <strong>${subfolders.length + files.length}</strong> items
          ${subfolders.length > 0 ? `(${subfolders.length} ${subfolders.length === 1 ? 'folder' : 'folders'}, ${files.length} ${files.length === 1 ? 'file' : 'files'})` : ''}
        </div>
        <div class="stats-item">
          Total size: <strong>${formatFileSize(files.reduce((acc, f) => acc + f.size, 0))}</strong>
        </div>
      </div>`
        : ''
    }
  </div>
</body>
</html>
  `
}
