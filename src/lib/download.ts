import { api } from '../api/client';

/**
 * Fetches an auth-protected file (the axios instance attaches the Bearer token)
 * as a blob and triggers a browser download. Used for HR attachments served by
 * streaming endpoints that a plain <a href> could not authenticate.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  const res = await api.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(res.data as Blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}

/** Uploads a single file (multipart `file` field) to a streaming upload endpoint. */
export async function uploadFile(url: string, file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  await api.post(url, form);
}
