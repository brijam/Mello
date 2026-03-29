import { useState, useRef, useEffect } from 'react';
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
    memberIds?: string[];
    checklistItems?: { total: number; checked: number } | null;
    attachmentCount?: number;
    commentCount?: number;
    isTemplate?: boolean;
  };
  listId: string;
}

export default function Card({ card, listId }: CardProps) {
  const { deleteCard, labels, members } = useBoardStore();
  const [showDetail, setShowDetail] = useState(false);
  const wasDragged = useRef(false);

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

  // Track if a drag happened so we can suppress click
  useEffect(() => {
    if (isDragging) {
      wasDragged.current = true;
    }
  }, [isDragging]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const cardLabels = labels.filter((l) => card.labelIds?.includes(l.id));
  const cardMembers = members.filter((m) => card.memberIds?.includes(m.id));

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={() => {
          if (wasDragged.current) {
            wasDragged.current = false;
            return;
          }
          setShowDetail(true);
        }}
        className={`rounded-lg shadow-sm px-3 py-2 cursor-pointer group ${
          card.isTemplate
            ? 'bg-blue-50 border border-dashed border-blue-300 hover:bg-blue-100'
            : 'bg-white hover:bg-gray-50'
        }`}
      >
        {card.isTemplate && (
          <div className="flex items-center gap-1 mb-1.5">
            <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Template</span>
          </div>
        )}
        {cardLabels.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5 justify-start">
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
            onPointerUp={(e) => e.stopPropagation()}
            className="text-gray-300 hover:text-gray-500 text-sm opacity-0 group-hover:opacity-100 transition-opacity ml-2"
          >
            &times;
          </button>
        </div>
        {/* Status line: description, comments, attachments, checklists */}
        {(card.description || (card.commentCount ?? 0) > 0 || (card.attachmentCount ?? 0) > 0 || card.checklistItems) && (
          <div className="flex items-center gap-2.5 mt-1.5 text-gray-500">
            {/* Description icon - three horizontal lines */}
            {card.description && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            )}

            {/* Comments */}
            {(card.commentCount ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 text-xs">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {card.commentCount}
              </span>
            )}

            {/* Attachments */}
            {(card.attachmentCount ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 text-xs">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                {card.attachmentCount}
              </span>
            )}

            {/* Checklists */}
            {card.checklistItems && (
              <span className={`flex items-center gap-0.5 text-xs ${
                card.checklistItems.checked === card.checklistItems.total && card.checklistItems.total > 0
                  ? 'text-green-600'
                  : ''
              }`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                {card.checklistItems.checked}/{card.checklistItems.total}
              </span>
            )}
          </div>
        )}
        {cardMembers.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5 justify-end">
            {cardMembers.map((member) => (
              <div
                key={member.id}
                className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-sm font-medium text-white flex-shrink-0 overflow-hidden"
                title={member.displayName}
              >
                {member.avatarUrl ? (
                  <img src={member.avatarUrl} alt={member.displayName} className="w-full h-full object-cover" />
                ) : (
                  member.displayName.charAt(0).toUpperCase()
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showDetail} onClose={() => setShowDetail(false)}>
        <CardDetail cardId={card.id} onClose={() => setShowDetail(false)} />
      </Modal>
    </>
  );
}
