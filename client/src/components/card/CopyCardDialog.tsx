import { useState, useEffect } from 'react';
import { api } from '../../api/client.js';
import { useBoardStore } from '../../stores/boardStore.js';

interface CardDetailData {
  id: string;
  listId: string;
  boardId: string;
  name: string;
  description: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  labels: { id: string; name: string; color: string }[];
  members: { id: string; username: string; displayName: string; avatarUrl: string | null }[];
  checklists: {
    id: string;
    name: string;
    position: number;
    items: { id: string; name: string; checked: boolean; position: number }[];
  }[];
  attachments: unknown[];
  commentCount: number;
}

interface BoardOption {
  id: string;
  name: string;
}

interface ListOption {
  id: string;
  name: string;
  cards: { id: string; position: number }[];
}

interface CopyCardDialogProps {
  card: CardDetailData;
  currentListId: string;
  currentBoardId: string;
  lists: Array<{ id: string; name: string; cards: unknown[] }>;
  onClose: () => void;
  onCopied: () => void;
}

export default function CopyCardDialog({
  card,
  currentListId,
  currentBoardId,
  lists: currentBoardLists,
  onClose,
  onCopied,
}: CopyCardDialogProps) {
  const [title, setTitle] = useState(`Copy of ${card.name}`);
  const [keepChecklists, setKeepChecklists] = useState(true);
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState(currentBoardId);
  const [availableLists, setAvailableLists] = useState<ListOption[]>([]);
  const [selectedListId, setSelectedListId] = useState(currentListId);
  const [position, setPosition] = useState(1);
  const [maxPosition, setMaxPosition] = useState(1);
  const [copying, setCopying] = useState(false);

  const workspaceId = useBoardStore.getState().board?.workspaceId;

  // Fetch boards
  useEffect(() => {
    if (!workspaceId) return;
    api
      .get<{ boards: BoardOption[] }>(`/workspaces/${workspaceId}/boards`)
      .then((data) => {
        setBoards(data.boards);
      })
      .catch(() => {
        // Fallback: just use current board
        const board = useBoardStore.getState().board;
        if (board) {
          setBoards([{ id: board.id, name: board.name }]);
        }
      });
  }, [workspaceId]);

  // Fetch lists when board changes
  useEffect(() => {
    if (selectedBoardId === currentBoardId) {
      // Use lists from the store for the current board
      const mapped: ListOption[] = currentBoardLists.map((l) => ({
        id: l.id,
        name: l.name,
        cards: (l.cards as { id: string; position: number }[]) ?? [],
      }));
      setAvailableLists(mapped);
      // Reset list selection to current if available
      if (mapped.some((l) => l.id === currentListId)) {
        setSelectedListId(currentListId);
      } else if (mapped.length > 0) {
        setSelectedListId(mapped[0].id);
      }
    } else {
      // Fetch lists for the other board
      api
        .get<{ lists: ListOption[] }>(`/boards/${selectedBoardId}/lists`)
        .then((data) => {
          setAvailableLists(data.lists);
          if (data.lists.length > 0) {
            setSelectedListId(data.lists[0].id);
          }
        })
        .catch(() => {
          setAvailableLists([]);
        });
    }
  }, [selectedBoardId, currentBoardId, currentBoardLists, currentListId]);

  // Update position options when list changes
  useEffect(() => {
    const list = availableLists.find((l) => l.id === selectedListId);
    const cardCount = list?.cards?.length ?? 0;
    const max = cardCount + 1;
    setMaxPosition(max);
    setPosition(max); // Default to end
  }, [selectedListId, availableLists]);

  const handleCopy = async () => {
    if (!title.trim()) return;
    setCopying(true);
    try {
      await api.post(`/cards/${card.id}/copy`, {
        name: title.trim(),
        listId: selectedListId,
        position,
        keepChecklists,
      });
      onCopied();
    } catch {
      // ignore
      setCopying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-[24rem] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Copy Card</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Title */}
        <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
        <input
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        {/* Keep checklists */}
        {card.checklists.length > 0 && (
          <label className="flex items-center gap-2 mb-3 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={keepChecklists}
              onChange={(e) => setKeepChecklists(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            Keep checklists ({card.checklists.length})
          </label>
        )}

        {/* Board selector */}
        <label className="block text-xs font-medium text-gray-500 mb-1">Board</label>
        <select
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={selectedBoardId}
          onChange={(e) => setSelectedBoardId(e.target.value)}
        >
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}{b.id === currentBoardId ? ' (current)' : ''}
            </option>
          ))}
        </select>

        {/* List selector */}
        <label className="block text-xs font-medium text-gray-500 mb-1">List</label>
        <select
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={selectedListId}
          onChange={(e) => setSelectedListId(e.target.value)}
        >
          {availableLists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}{l.id === currentListId && selectedBoardId === currentBoardId ? ' (current)' : ''}
            </option>
          ))}
        </select>

        {/* Position selector */}
        <label className="block text-xs font-medium text-gray-500 mb-1">Position</label>
        <select
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
        >
          {Array.from({ length: maxPosition }, (_, i) => i + 1).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            disabled={copying || !title.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded"
          >
            {copying ? 'Copying...' : 'Copy'}
          </button>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
