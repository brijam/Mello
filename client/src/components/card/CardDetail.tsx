import { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client.js';
import { useBoardStore } from '../../stores/boardStore.js';
import MarkdownRenderer from './MarkdownRenderer.js';
import LabelPicker from './LabelPicker.js';
import LabelBadge from '../board/LabelBadge.js';
import CardChecklist from './CardChecklist.js';
import CardComments from './CardComments.js';

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

interface CardDetailProps {
  cardId: string;
  onClose: () => void;
}

export default function CardDetail({ cardId, onClose }: CardDetailProps) {
  const [card, setCard] = useState<CardDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Description editing
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState('');
  const descTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Label picker
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const labelBtnRef = useRef<HTMLButtonElement>(null);

  const lists = useBoardStore((s) => s.lists);
  const labels = useBoardStore((s) => s.labels);
  const deleteCardStore = useBoardStore((s) => s.deleteCard);
  const updateCardStore = useBoardStore((s) => s.updateCard);
  const toggleCardLabelStore = useBoardStore((s) => s.toggleCardLabel);

  const listName = card ? lists.find((l) => l.id === card.listId)?.name ?? 'Unknown list' : '';

  // Fetch card detail
  const fetchCard = async () => {
    try {
      const data = await api.get<{ card: CardDetailData }>(`/cards/${cardId}`);
      setCard(data.card);
      setTitleValue(data.card.name);
      setDescValue(data.card.description ?? '');
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load card');
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<{ card: CardDetailData }>(`/cards/${cardId}`)
      .then((data) => {
        if (!cancelled) {
          setCard(data.card);
          setTitleValue(data.card.name);
          setDescValue(data.card.description ?? '');
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load card');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  // Focus title input when editing
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  // Focus desc textarea when editing
  useEffect(() => {
    if (editingDesc) descTextareaRef.current?.focus();
  }, [editingDesc]);

  // -- Handlers --

  const handleTitleSave = async () => {
    if (!card) return;
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === card.name) {
      setTitleValue(card.name);
      setEditingTitle(false);
      return;
    }
    try {
      await updateCardStore(cardId, { name: trimmed });
      setCard((prev) => (prev ? { ...prev, name: trimmed } : prev));
    } catch {
      setTitleValue(card.name);
    }
    setEditingTitle(false);
  };

  const handleDescSave = async () => {
    if (!card) return;
    const newDesc = descValue.trim() || null;
    try {
      await updateCardStore(cardId, { description: newDesc });
      setCard((prev) => (prev ? { ...prev, description: newDesc } : prev));
    } catch {
      setDescValue(card.description ?? '');
    }
    setEditingDesc(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this card? This cannot be undone.')) return;
    try {
      await deleteCardStore(cardId);
      onClose();
    } catch {
      // ignore
    }
  };

  const handleAddChecklist = async () => {
    const name = prompt('Checklist name:');
    if (!name?.trim()) return;
    try {
      await api.post(`/cards/${cardId}/checklists`, { name: name.trim() });
      await fetchCard();
    } catch {
      // ignore
    }
  };

  // -- Render --

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full p-8 text-center text-gray-500">
        Loading card...
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full p-8 text-center">
        <p className="text-red-600 mb-4">{error ?? 'Card not found'}</p>
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
          Close
        </button>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto relative"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl leading-none z-10"
        title="Close"
      >
        &times;
      </button>

      {/* Header */}
      <div className="p-6 pb-2 pr-12">
        {editingTitle ? (
          <input
            ref={titleInputRef}
            className="text-xl font-semibold w-full border border-blue-400 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSave();
              if (e.key === 'Escape') {
                setTitleValue(card.name);
                setEditingTitle(false);
              }
            }}
          />
        ) : (
          <h2
            className="text-xl font-semibold cursor-pointer hover:bg-gray-100 rounded px-2 py-1 -mx-2"
            onClick={() => setEditingTitle(true)}
          >
            {card.name}
          </h2>
        )}
        <p className="text-sm text-gray-500 mt-1 px-2 -mx-2">
          in list <span className="font-medium text-gray-700">{listName}</span>
        </p>
      </div>

      {/* Body: two-column layout */}
      <div className="flex p-6 pt-4 gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Description */}
          <section className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Description
              </h3>
              {!editingDesc && (
                <button
                  onClick={() => {
                    setDescValue(card.description ?? '');
                    setEditingDesc(true);
                  }}
                  className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded"
                >
                  Edit
                </button>
              )}
            </div>

            {editingDesc ? (
              <div>
                <textarea
                  ref={descTextareaRef}
                  className="w-full min-h-[120px] border border-gray-300 rounded p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  value={descValue}
                  onChange={(e) => setDescValue(e.target.value)}
                  placeholder="Add a more detailed description..."
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleDescSave}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setDescValue(card.description ?? '');
                      setEditingDesc(false);
                    }}
                    className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : card.description ? (
              <div className="min-h-[100px]">
                <MarkdownRenderer content={card.description} />
              </div>
            ) : (
              <div
                className="min-h-[100px] bg-gray-100 hover:bg-gray-200 rounded p-3 text-sm text-gray-500 cursor-pointer"
                onClick={() => {
                  setDescValue('');
                  setEditingDesc(true);
                }}
              >
                Add a more detailed description...
              </div>
            )}
          </section>

          {/* Labels */}
          {card.labels.length > 0 && (
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Labels
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {card.labels.map((label) => (
                  <LabelBadge key={label.id} color={label.color} name={label.name} size="md" />
                ))}
              </div>
            </section>
          )}

          {card.checklists.length > 0 && (
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Checklists
              </h3>
              {card.checklists.map((cl) => (
                <CardChecklist key={cl.id} checklist={cl} onUpdate={fetchCard} />
              ))}
            </section>
          )}

          <section className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
              Attachments
            </h3>
            <p className="text-sm text-gray-400">Coming soon</p>
          </section>

          <section className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
              Activity
            </h3>
            <CardComments cardId={card.id} />
          </section>
        </div>

        {/* Sidebar */}
        <div className="w-48 flex-shrink-0">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Actions
          </h3>
          <div className="flex flex-col gap-2">
            <button className="text-left text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded">
              Members
            </button>
            <div className="relative">
              <button
                ref={labelBtnRef}
                onClick={() => setShowLabelPicker((v) => !v)}
                className="w-full text-left text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded"
              >
                Labels
              </button>
              {showLabelPicker && (
                <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                  <LabelPicker
                    cardId={card.id}
                    boardId={card.boardId}
                    cardLabelIds={card.labels.map((l) => l.id)}
                    onToggle={(labelId, added) => {
                      toggleCardLabelStore(card.id, labelId, added);
                      // Update local card state
                      setCard((prev) => {
                        if (!prev) return prev;
                        if (added) {
                          const label = labels.find((l) => l.id === labelId);
                          if (!label) return prev;
                          return {
                            ...prev,
                            labels: [...prev.labels, { id: label.id, name: label.name ?? '', color: label.color }],
                          };
                        } else {
                          return {
                            ...prev,
                            labels: prev.labels.filter((l) => l.id !== labelId),
                          };
                        }
                      });
                    }}
                  />
                </div>
              )}
            </div>
            <button
              onClick={handleAddChecklist}
              className="text-left text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded"
            >
              Checklist
            </button>
            <button className="text-left text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded">
              Attachment
            </button>
            <hr className="my-2 border-gray-200" />
            <button
              onClick={handleDelete}
              className="text-left text-sm bg-red-100 hover:bg-red-200 text-red-700 px-3 py-2 rounded"
            >
              Delete Card
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
