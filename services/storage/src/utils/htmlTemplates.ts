import { PORT } from '../constants/index.js'

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export const generateSharedFolderHtml = (
  folderName: string,
  folderPath: string,
  files: { id: string; originalName: string; mimeType: string; size: number }[],
  subfolders: { id: string; name: string }[],
  shareToken: string,
  isError: boolean = false,
  currentSubPath?: string
): string => {
  const baseUrl = process.env.STORAGE_PUBLIC_URL || `http://localhost:${PORT}`
  
  if (isError) {
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Error</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f3f4f6; color: #374151; }
          .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); text-align: center; max-width: 400px; width: 90%; }
          h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #ef4444; }
          p { color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>⚠️ Link Expired</h1>
          <p>The shared link you are trying to access is invalid or has expired.</p>
        </div>
      </body>
    </html>`
  }

  // Breadcrumbs Logic
  const breadcrumbs = currentSubPath ? currentSubPath.split('/') : []
  let breadcrumbHtml = `<a href="${baseUrl}/api/share/${shareToken}" class="crumb root-crumb">📁 ${folderName}</a>`
  
  let pathSoFar = ''
  for (const crumb of breadcrumbs) {
    pathSoFar += (pathSoFar ? '/' : '') + crumb
    breadcrumbHtml += ` <span class="sep">/</span> <a href="${baseUrl}/api/share/${shareToken}?path=${encodeURIComponent(pathSoFar)}" class="crumb">${crumb}</a>`
  }

  const fileRows = files.map(file => {
    // Determine icon based on mime type
    let icon = '📄'
    if (file.mimeType.startsWith('image/')) icon = '🖼️'
    if (file.mimeType.includes('pdf')) icon = '📕'
    if (file.mimeType.includes('video')) icon = '🎬'

    return `
      <tr onclick="window.location='${baseUrl}/api/share/${shareToken}/file/${file.id}'" class="clickable">
        <td>
          <div class="file-info">
            <span class="icon">${icon}</span>
            <span class="name">${file.originalName}</span>
          </div>
        </td>
        <td class="meta">${file.mimeType}</td>
        <td class="meta">${formatFileSize(file.size)}</td>
        <td class="actions">
          <a href="${baseUrl}/api/share/${shareToken}/file/${file.id}?download=true" class="btn btn-download" onclick="event.stopPropagation()">
            Download
          </a>
        </td>
      </tr>`
  }).join('')

  const folderRows = subfolders.map(folder => {
    const subPath = currentSubPath ? `${currentSubPath}/${folder.name}` : folder.name
    return `
      <tr onclick="window.location='${baseUrl}/api/share/${shareToken}?path=${encodeURIComponent(subPath)}'" class="clickable folder-row">
        <td>
          <div class="file-info">
            <span class="icon">📁</span>
            <span class="name">${folder.name}</span>
          </div>
        </td>
        <td class="meta">Folder</td>
        <td class="meta">-</td>
        <td class="actions">
          <span class="btn btn-open">Open</span>
        </td>
      </tr>`
  }).join('')

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${currentSubPath ? currentSubPath.split('/').pop() : folderName} - Shared Storage</title>
  <style>
    :root {
      --bg: #ffffff;
      --surface: #f8fafc;
      --border: #e2e8f0;
      --text: #0f172a;
      --text-muted: #64748b;
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--surface);
      color: var(--text);
      padding: 2rem;
      line-height: 1.5;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
      background: var(--bg);
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border: 1px solid var(--border);
      overflow: hidden;
    }
    .header {
      padding: 1.5rem 2rem;
      border-bottom: 1px solid var(--border);
      background: white;
    }
    .breadcrumbs {
      font-size: 1.1rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .crumb { color: var(--text); text-decoration: none; font-weight: 500; padding: 4px 8px; border-radius: 6px; }
    .crumb:hover { background-color: var(--surface); color: var(--primary); }
    .sep { color: #cbd5e1; }
    
    .table-container { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { 
      padding: 0.75rem 1.5rem;
      background: #f1f5f9;
      color: #475569;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--border);
    }
    td { padding: 1rem 1.5rem; border-bottom: 1px solid var(--border); transition: background 0.15s; }
    tr.clickable:hover { background-color: #f8fafc; cursor: pointer; }
    tr:last-child td { border-bottom: none; }
    
    .file-info { display: flex; align-items: center; gap: 0.75rem; }
    .icon { font-size: 1.25rem; }
    .name { font-weight: 500; color: var(--text); }
    .meta { color: var(--text-muted); font-size: 0.875rem; }
    
    .actions { text-align: right; }
    .btn { 
      display: inline-flex; 
      align-items: center; 
      justify-content: center;
      padding: 0.5rem 1rem; 
      border-radius: 6px; 
      font-size: 0.875rem; 
      font-weight: 500; 
      text-decoration: none; 
      transition: all 0.2s;
    }
    .btn-download { background-color: var(--surface); color: var(--text); border: 1px solid var(--border); }
    .btn-download:hover { border-color: var(--primary); color: var(--primary); }
    .btn-open { color: var(--text-muted); font-size: 0.75rem; pointer-events: none; }

    .empty-state { padding: 4rem; text-align: center; color: var(--text-muted); }

    @media (max-width: 640px) {
      body { padding: 1rem; }
      .meta { display: none; }
      th:nth-child(2), th:nth-child(3) { display: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="breadcrumbs">${breadcrumbHtml}</div>
    </div>
    
    <div class="table-container">
      ${files.length === 0 && subfolders.length === 0 ? 
        `<div class="empty-state">
           <div style="font-size: 2rem; margin-bottom: 1rem;">📂</div>
           <p>This folder is empty</p>
         </div>` : 
        `<table>
          <thead>
            <tr>
              <th style="width: 50%">Name</th>
              <th style="width: 15%">Type</th>
              <th style="width: 15%">Size</th>
              <th style="width: 20%; text-align: right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${folderRows}
            ${fileRows}
          </tbody>
        </table>`
      }
    </div>
  </div>
</body>
</html>
  `
}
