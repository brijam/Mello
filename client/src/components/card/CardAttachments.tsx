import { useState, useRef, useCallback, useEffect } from 'react';

interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  userId?: string;
}

interface CardAttachmentsProps {
  cardId: string;
  attachments: Attachment[];
  onRefresh: () => void;
  currentUserId?: string;
  coverAttachmentId?: string | null;
  onCoverChange?: (attachmentId: string | null) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function CardAttachments({ cardId, attachments, onRefresh, currentUserId, coverAttachmentId, onCoverChange }: CardAttachmentsProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    try {
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

      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [cardId, onRefresh]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  // Paste-from-clipboard for screenshots (Alt-PrintScreen → Ctrl-V)
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) {
            const ext = f.type.split('/')[1] || 'png';
            const named = f.name && f.name !== 'image.png'
              ? f
              : new File([f], `screenshot-${Date.now()}.${ext}`, { type: f.type });
            imageFiles.push(named);
          }
        }
      }
      if (imageFiles.length === 0) return;
      e.preventDefault();
      void Promise.all(imageFiles.map(uploadFile));
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [uploadFile]);

  const setCover = async (attachmentId: string | null) => {
    try {
      const res = await fetch(`/api/v1/cards/${cardId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverAttachmentId: attachmentId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || 'Failed to update cover');
      }
      onCoverChange?.(attachmentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update cover');
    }
  };

  const handleDelete = async (attachmentId: string) => {
    if (!confirm('Delete this attachment?')) return;
    try {
      const res = await fetch(`/api/v1/attachments/${attachmentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || 'Delete failed');
      }
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const isImage = (mimeType: string) => mimeType.startsWith('image/');

  return (
    <div>
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-4 mb-3 text-center transition-colors cursor-pointer ${
          dragOver
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
            <span className="text-sm text-gray-600">Uploading...</span>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-600 font-medium">
              Drop a file here or click to browse
            </p>
            <p className="text-sm text-gray-400 mt-1">Max file size: 25 MB</p>
          </div>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
          {error}
        </div>
      )}

      {/* File list */}
      {attachments.length === 0 ? (
        <p className="text-sm text-gray-400">No attachments yet</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 group"
            >
              {/* Thumbnail or icon */}
              <div className="flex-shrink-0 w-12 h-12 rounded bg-gray-200 flex items-center justify-center overflow-hidden">
                {isImage(att.mimeType) ? (
                  <img
                    src={`/api/v1/attachments/${att.id}/download`}
                    alt={att.filename}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                )}
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <a
                  href={`/api/v1/attachments/${att.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline truncate block"
                >
                  {att.filename}
                </a>
                <p className="text-sm text-gray-500 mt-0.5">
                  {formatFileSize(att.sizeBytes)} -- {formatDate(att.createdAt)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {isImage(att.mimeType) && (
                  <button
                    onClick={() => setCover(coverAttachmentId === att.id ? null : att.id)}
                    className={`text-xs px-2 py-1 rounded ${
                      coverAttachmentId === att.id
                        ? 'text-blue-700 bg-blue-100 hover:bg-blue-200'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                    }`}
                    title={coverAttachmentId === att.id ? 'Remove cover' : 'Make cover'}
                  >
                    {coverAttachmentId === att.id ? 'Remove cover' : 'Make cover'}
                  </button>
                )}
                <a
                  href={`/api/v1/attachments/${att.id}/download`}
                  download
                  className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-200"
                  title="Download"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
                <button
                  onClick={() => handleDelete(att.id)}
                  className="text-sm text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-100"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
