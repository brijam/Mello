// Attachment uploads use multipart/form-data, which the JSON `api` client in
// client.ts can't express, so they go through a dedicated raw-fetch helper.

export async function uploadAttachment(cardId: string, file: File): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`/api/v1/cards/${cardId}/attachments`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || 'Upload failed');
  }
}
