/**
 * Direct `/uploads` static serving is only for local + non-proxy mode.
 * When FILE_PROXY_MODE=true, all access must go through /api/files/:id/content
 * (auth or purpose-limited file-view tokens).
 *
 * In direct mode, filesystem paths under /uploads are treated as publicly readable.
 * Private content must still use the authenticated content route — prefer proxy mode
 * for any deployment that stores private files.
 */
export function shouldMountLocalStaticUploads(
  storageType: string,
  fileProxyMode: boolean
): boolean {
  return storageType === 'local' && !fileProxyMode
}
