import { useState } from 'react';
import { api } from '../../api/client.js';
import { useBoardStore } from '../../stores/boardStore.js';

interface TemplateCardProps {
  card: {
    id: string;
    name: string;
    isTemplate?: boolean;
  };
  listId: string;
  onCreated?: () => void;
}

export default function TemplateCard({ card, listId, onCreated }: TemplateCardProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState(card.name);
  const [creating, setCreating] = useState(false);
  const boardId = useBoardStore.getState().board?.id;

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await api.post(`/cards/${card.id}/copy`, {
        name: newName.trim(),
        listId,
      });
      // Refresh the board
      if (boardId) {
        await useBoardStore.getState().fetchBoard(boardId);
      }
      setShowCreate(false);
      setNewName(card.name);
      onCreated?.();
    } catch {
      // ignore
    }
    setCreating(false);
  };

  return (
    <>
      <button
        onClick={() => setShowCreate(true)}
        className="w-full text-left bg-blue-50 border border-dashed border-blue-300 rounded-lg px-3 py-2 hover:bg-blue-100 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
          </svg>
          <span className="text-sm text-gray-700">{card.name}</span>
        </div>
      </button>

      {showCreate && (
        <div className="mt-1.5 bg-white border border-gray-300 rounded-lg p-2 shadow-sm">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setShowCreate(false);
            }}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            placeholder="Card name..."
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-3 py-1 rounded"
            >
              {creating ? 'Creating...' : 'Create card'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
