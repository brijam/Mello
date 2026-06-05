import { useRef, useState } from 'react';
import { useBoardStore } from '../../stores/boardStore.js';
import { uploadAttachment } from '../../api/attachments.js';

interface AddCardProps {
  listId: string;
}

export default function AddCard({ listId }: AddCardProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addCard, incrementCardAttachmentCount } = useBoardStore();

  const reset = () => {
    setName('');
    setFiles([]);
    setError(null);
  };

  const addFiles = (selected: FileList | null) => {
    if (selected && selected.length > 0) {
      setFiles((prev) => [...prev, ...Array.from(selected)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const card = await addCard(listId, name.trim());

      if (files.length > 0) {
        const results = await Promise.allSettled(
          files.map((file) => uploadAttachment(card.id, file)),
        );
        const uploaded = results.filter((r) => r.status === 'fulfilled').length;
        incrementCardAttachmentCount(card.id, uploaded);

        const failed = results.length - uploaded;
        if (failed > 0) {
          // The card exists; only some uploads failed. Keep the composer open and
          // tell the user, since re-submitting here would create a different card.
          setName('');
          setFiles([]);
          setError(
            `Card created, but ${failed} attachment${failed > 1 ? 's' : ''} failed to upload. ` +
              `Open the card to add ${failed > 1 ? 'them' : 'it'} again.`,
          );
          return;
        }
      }

      reset();
      // Scroll the list's card container to the bottom so the new card is visible.
      // Wait a frame so the new card has mounted before measuring scrollHeight.
      requestAnimationFrame(() => {
        const container = document.querySelector<HTMLElement>(`[data-list-id="${listId}"]`);
        if (container) container.scrollTop = container.scrollHeight;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add card');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAdding) {
    return (
      <button
        data-add-card-button
        onClick={() => setIsAdding(true)}
        className="w-full text-left text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-300/50 rounded-lg px-2 py-1.5 transition-colors"
      >
        + Add a card
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
          if (e.key === 'Escape') {
            setIsAdding(false);
            reset();
          }
        }}
        placeholder="Enter a title for this card..."
        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-mello-blue"
        rows={2}
      />

      {files.length > 0 && (
        <ul className="mt-1 space-y-1">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center gap-2 bg-gray-100 rounded px-2 py-1 text-xs text-gray-700"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              <span className="truncate flex-1">{file.name}</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-gray-400 hover:text-red-500 flex-shrink-0"
                aria-label={`Remove ${file.name}`}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mt-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          // Reset so the same file can be picked again after removal.
          e.target.value = '';
        }}
      />

      <div className="flex items-center gap-2 mt-1">
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="bg-mello-blue text-white text-sm px-3 py-1 rounded disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add card'}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          title="Attach files"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          Attach
        </button>
        <button
          type="button"
          onClick={() => {
            setIsAdding(false);
            reset();
          }}
          className="text-sm text-gray-500 ml-auto"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
