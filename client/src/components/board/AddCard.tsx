import { useState } from 'react';
import { useBoardStore } from '../../stores/boardStore.js';

interface AddCardProps {
  listId: string;
}

export default function AddCard({ listId }: AddCardProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const { addCard } = useBoardStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await addCard(listId, name.trim());
    setName('');
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
          if (e.key === 'Escape') setIsAdding(false);
        }}
        placeholder="Enter a title for this card..."
        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-mello-blue"
        rows={2}
      />
      <div className="flex gap-2 mt-1">
        <button type="submit" className="bg-mello-blue text-white text-sm px-3 py-1 rounded">
          Add card
        </button>
        <button type="button" onClick={() => setIsAdding(false)} className="text-sm text-gray-500">
          Cancel
        </button>
      </div>
    </form>
  );
}
