import { useState } from 'react';
import { useBoardStore } from '../../stores/boardStore.js';

interface AddListProps {
  boardId: string;
}

export default function AddList({ boardId }: AddListProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const { addList } = useBoardStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await addList(boardId, name.trim());
    setName('');
  };

  if (!isAdding) {
    return (
      <button
        onClick={() => setIsAdding(true)}
        className="w-[18rem] flex-shrink-0 bg-white/30 hover:bg-white/50 text-white rounded-xl px-3 py-2 text-sm text-left transition-colors"
      >
        + Add another list
      </button>
    );
  }

  return (
    <div className="w-[18rem] flex-shrink-0 bg-gray-200 rounded-xl p-2">
      <form onSubmit={handleSubmit}>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setIsAdding(false)}
          placeholder="Enter list title..."
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-mello-blue"
        />
        <div className="flex gap-2 mt-2">
          <button type="submit" className="bg-mello-blue text-white text-sm px-3 py-1 rounded">
            Add list
          </button>
          <button type="button" onClick={() => setIsAdding(false)} className="text-sm text-gray-500">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
