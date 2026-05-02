import { apiFetch } from './apiClient';

export type AccountAttachment = {
  id: string;
  account_id: string;
  uploaded_by_user_id: string | null;
  uploaded_by_email: string | null;
  file_name: string;
  file_size: number | null;
  file_type: string | null;
  storage_path: string;
  created_at: string;
  signed_url: string | null;
};

const ENDPOINT = '/api/account-attachments';

async function asJson<T>(r: Response): Promise<T> {
  const text = await r.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text.slice(0, 200) || `HTTP ${r.status}`);
  }
}

export async function listAccountAttachments(accountId: string): Promise<AccountAttachment[]> {
  const r = await apiFetch(`${ENDPOINT}?accountId=${encodeURIComponent(accountId)}`);
  if (!r.ok) {
    const j = await asJson<{ error?: string }>(r).catch(() => ({} as { error?: string }));
    throw new Error(j.error || `HTTP ${r.status}`);
  }
  const data = await asJson<{ attachments: AccountAttachment[] }>(r);
  return data.attachments ?? [];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read'));
    reader.readAsDataURL(file);
  });
}

export async function uploadAccountAttachment(
  accountId: string,
  file: File
): Promise<AccountAttachment> {
  const fileBase64 = await fileToBase64(file);
  const r = await apiFetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId,
      fileName: file.name,
      fileType: file.type || null,
      fileBase64,
    }),
  });
  if (!r.ok) {
    const j = await asJson<{ error?: string }>(r).catch(() => ({} as { error?: string }));
    throw new Error(j.error || `HTTP ${r.status}`);
  }
  const data = await asJson<{ attachment: AccountAttachment }>(r);
  return data.attachment;
}

export async function deleteAccountAttachment(id: string): Promise<void> {
  const r = await apiFetch(`${ENDPOINT}?action=delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!r.ok) {
    const j = await asJson<{ error?: string }>(r).catch(() => ({} as { error?: string }));
    throw new Error(j.error || `HTTP ${r.status}`);
  }
}
