import { useState, useEffect } from 'react';
import { api } from '../../api/client.js';
import { useBoardStore } from '../../stores/boardStore.js';

interface MoveAllCardsDialogProps {
  listId: string;
  listName: string;
  currentBoardId: string;
  onClose: () => void;
  onMoved: () => void;
}

export default function MoveAllCardsDialog({ listId, listName, currentBoardId, onClose, onMoved }: MoveAllCardsDialogProps) {
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState(currentBoardId);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [selectedListId, setSelectedListId] = useState('');
  const [moving, setMoving] = useState(false);

  const workspaceId = useBoardStore.getState().board?.workspaceId;
  const storeLists = useBoardStore((s) => s.lists);

  // Fetch all boards in the workspace
  useEffect(() => {
    if (!workspaceId) return;
    api.get<{ boards: { id: string; name: string }[] }>(`/workspaces/${workspaceId}/boards`)
      .then((data) => {
        setBoards(data.boards);
      })
      .catch(() => {});
  }, [workspaceId]);

  // When selected board changes, update the list of available lists
  useEffect(() => {
    if (selectedBoardId === currentBoardId) {
      // Use lists from the store, exclude the current list
      const otherLists = storeLists
        .filter((l) => l.id !== listId)
        .map((l) => ({ id: l.id, name: l.name }));
      setLists(otherLists);
      setSelectedListId(otherLists.length > 0 ? otherLists[0].id : '');
    } else if (selectedBoardId) {
      // Fetch lists from the API for other boards
      api.get<{ lists: { id: string; name: string }[] }>(`/boards/${selectedBoardId}/lists`)
        .then((data) => {
          setLists(data.lists);
          setSelectedListId(data.lists.length > 0 ? data.lists[0].id : '');
        })
        .catch(() => {
          setLists([]);
          setSelectedListId('');
        });
    }
  }, [selectedBoardId, currentBoardId, listId, storeLists]);

  const handleMove = async () => {
    if (!selectedListId || moving) return;
    setMoving(true);
    try {
      await api.post(`/lists/${listId}/move-all-cards`, { targetListId: selectedListId });
      onMoved();
    } catch {
      setMoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[20rem] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Move All Cards from &ldquo;{listName}&rdquo;</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        <label className="block text-xs font-medium text-gray-500 mb-1">Board</label>
        <select
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={selectedBoardId}
          onChange={(e) => setSelectedBoardId(e.target.value)}
        >
          {boards.map((b) => (
            <option key={b.id} value={b.id}>{b.name}{b.id === currentBoardId ? ' (current)' : ''}</option>
          ))}
        </select>

        <label className="block text-xs font-medium text-gray-500 mb-1">List</label>
        {lists.length === 0 ? (
          <p className="text-sm text-gray-500 mb-3">No other lists available.</p>
        ) : (
          <>
            <select
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedListId}
              onChange={(e) => setSelectedListId(e.target.value)}
            >
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>

            <div className="flex gap-2">
              <button
                onClick={handleMove}
                disabled={moving || !selectedListId}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded"
              >
                {moving ? 'Moving...' : 'Move All'}
              </button>
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
