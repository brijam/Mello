import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBoardStore } from '../../stores/boardStore.js';
import Card from './Card.js';
import AddCard from './AddCard.js';

interface ListProps {
  list: {
    id: string;
    name: string;
    cards: Array<{
      id: string;
      name: string;
      description: string | null;
      position: number;
    }>;
  };
}

export default function List({ list }: ListProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(list.name);
  const { updateList, deleteList } = useBoardStore();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `list-${list.id}`,
    data: {
      type: 'list',
      list,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleRename = async () => {
    if (name.trim() && name !== list.name) {
      await updateList(list.id, { name: name.trim() });
    }
    setIsEditing(false);
  };

  const sortedCards = [...list.cards].sort((a, b) => a.position - b.position);
  const cardIds = sortedCards.map((c) => `card-${c.id}`);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-gray-200 rounded-xl w-[18rem] flex-shrink-0 flex flex-col max-h-[calc(100vh-120px)]"
    >
      <div
        {...attributes}
        {...listeners}
        className="px-3 py-2 flex items-center justify-between cursor-grab"
      >
        {isEditing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            onPointerDown={(e) => e.stopPropagation()}
            className="font-semibold text-sm bg-white border border-blue-400 rounded px-1 py-0.5 w-full"
          />
        ) : (
          <h3
            onClick={() => setIsEditing(true)}
            className="font-semibold text-sm text-gray-800 cursor-pointer px-1"
          >
            {list.name}
          </h3>
        )}
        <button
          onClick={() => deleteList(list.id)}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-gray-400 hover:text-gray-600 text-sm ml-2"
          title="Delete list"
        >
          &times;
        </button>
      </div>

      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div className="flex-1 overflow-y-auto px-2 pb-1 space-y-1.5 min-h-[4px]">
          {sortedCards.map((card) => (
            <Card key={card.id} card={card} listId={list.id} />
          ))}
        </div>
      </SortableContext>

      <div className="px-2 pb-2">
        <AddCard listId={list.id} />
      </div>
    </div>
  );
}
