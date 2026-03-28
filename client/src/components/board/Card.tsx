import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBoardStore } from '../../stores/boardStore.js';
import LabelBadge from './LabelBadge.js';
import Modal from '../common/Modal.js';
import CardDetail from '../card/CardDetail.js';

interface CardProps {
  card: {
    id: string;
    name: string;
    description: string | null;
    labelIds?: string[];
  };
  listId: string;
}

export default function Card({ card, listId }: CardProps) {
  const { deleteCard, labels } = useBoardStore();
  const [showDetail, setShowDetail] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `card-${card.id}`,
    data: {
      type: 'card',
      card,
      listId,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const cardLabels = labels.filter((l) => card.labelIds?.includes(l.id));

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={() => setShowDetail(true)}
        className="bg-white rounded-lg shadow-sm px-3 py-2 cursor-grab hover:bg-gray-50 group"
      >
        {cardLabels.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {cardLabels.map((label) => (
              <LabelBadge key={label.id} color={label.color} name={label.name} size="sm" />
            ))}
          </div>
        )}
        <div className="flex items-start justify-between">
          <span className="text-sm text-gray-800">{card.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteCard(card.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
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

      <Modal isOpen={showDetail} onClose={() => setShowDetail(false)}>
        <CardDetail cardId={card.id} onClose={() => setShowDetail(false)} />
      </Modal>
    </>
  );
}
