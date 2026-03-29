import { useState, useEffect } from 'react';
import { api } from '../../api/client.js';
import { useBoardStore } from '../../stores/boardStore.js';

interface MoveListDialogProps {
  listId: string;
  listName: string;
  currentBoardId: string;
  onClose: () => void;
  onMoved: () => void;
}

export default function MoveListDialog({ listId, listName, currentBoardId, onClose, onMoved }: MoveListDialogProps) {
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [position, setPosition] = useState(1);
  const [maxPosition, setMaxPosition] = useState(1);
  const [moving, setMoving] = useState(false);

  const workspaceId = useBoardStore.getState().board?.workspaceId;

  useEffect(() => {
    if (!workspaceId) return;
    api.get<{ boards: { id: string; name: string }[] }>(`/workspaces/${workspaceId}/boards`)
      .then((data) => {
        // Exclude current board
        const otherBoards = data.boards.filter((b) => b.id !== currentBoardId);
        setBoards(otherBoards);
        if (otherBoards.length > 0) setSelectedBoardId(otherBoards[0].id);
      })
      .catch(() => {});
  }, [workspaceId, currentBoardId]);

  // Fetch list count for position selection
  useEffect(() => {
    if (!selectedBoardId) return;
    api.get<{ lists: { id: string }[] }>(`/boards/${selectedBoardId}/lists`)
      .then((data) => {
        setMaxPosition(data.lists.length + 1);
        setPosition(data.lists.length + 1); // Default to end
      })
      .catch(() => {});
  }, [selectedBoardId]);

  const handleMove = async () => {
    if (!selectedBoardId || moving) return;
    setMoving(true);
    try {
      await api.post(`/lists/${listId}/move`, { targetBoardId: selectedBoardId, position });
      onMoved();
    } catch {
      setMoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[20rem] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Move List &ldquo;{listName}&rdquo;</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        {boards.length === 0 ? (
          <p className="text-sm text-gray-500 mb-3">No other boards available.</p>
        ) : (
          <>
            <label className="block text-xs font-medium text-gray-500 mb-1">Board</label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedBoardId}
              onChange={(e) => setSelectedBoardId(e.target.value)}
            >
              {boards.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            <label className="block text-xs font-medium text-gray-500 mb-1">Position</label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={position}
              onChange={(e) => setPosition(Number(e.target.value))}
            >
              {Array.from({ length: maxPosition }, (_, i) => i + 1).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <div className="flex gap-2">
              <button
                onClick={handleMove}
                disabled={moving || !selectedBoardId}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded"
              >
                {moving ? 'Moving...' : 'Move'}
              </button>
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
