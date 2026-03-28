import { useBoardStore } from '../../stores/boardStore.js';

interface CardProps {
  card: {
    id: string;
    name: string;
    description: string | null;
  };
}

export default function Card({ card }: CardProps) {
  const { deleteCard } = useBoardStore();

  return (
    <div className="bg-white rounded-lg shadow-sm px-3 py-2 cursor-pointer hover:bg-gray-50 group">
      <div className="flex items-start justify-between">
        <span className="text-sm text-gray-800">{card.name}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteCard(card.id);
          }}
          className="text-gray-300 hover:text-gray-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity ml-2"
        >
          &times;
        </button>
      </div>
      {card.description && (
        <div className="mt-1 text-xs text-gray-400">
          &#x1F4DD;
        </div>
      )}
    </div>
  );
}
