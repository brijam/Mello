import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../api/client.js';
import { useBoardStore } from '../../stores/boardStore.js';
import { useAuthStore } from '../../stores/authStore.js';
import MarkdownRenderer from './MarkdownRenderer.js';
import LabelPicker from './LabelPicker.js';
import MemberPicker from './MemberPicker.js';
import LabelBadge from '../board/LabelBadge.js';
import CardChecklist from './CardChecklist.js';
import CardComments from './CardComments.js';
import CardAttachments from './CardAttachments.js';
import ActivityFeed from './ActivityFeed.js';
import CopyCardDialog from './CopyCardDialog.js';

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
  isTemplate: boolean;
  coverAttachmentId: string | null;
}

/** Click-outside wrapper for the label picker dropdown */
function LabelPickerDropdown({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute left-0 mt-1 w-[20rem] bg-white border border-gray-200 rounded-lg shadow-lg z-50">
      {children}
    </div>
  );
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

  // Member picker
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  // List picker (move card)
  const [showListPicker, setShowListPicker] = useState(false);
  const listPickerRef = useRef<HTMLDivElement>(null);

  // Three-dots menu
  const [showCardMenu, setShowCardMenu] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);

  const attachmentFileInputRef = useRef<HTMLInputElement>(null);

  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const refreshActivity = () => setActivityRefreshKey((k) => k + 1);

  const user = useAuthStore((s) => s.user);
  const lists = useBoardStore((s) => s.lists);
  const labels = useBoardStore((s) => s.labels);
  const members = useBoardStore((s) => s.members);
  const deleteCardStore = useBoardStore((s) => s.deleteCard);
  const updateCardStore = useBoardStore((s) => s.updateCard);
  const toggleCardLabelStore = useBoardStore((s) => s.toggleCardLabel);
  const toggleCardMemberStore = useBoardStore((s) => s.toggleCardMember);
  const updateCardChecklistStore = useBoardStore((s) => s.updateCardChecklist);

  const listName = card ? lists.find((l) => l.id === card.listId)?.name ?? 'Unknown list' : '';

  // Sync checklist summary counts to the board store for card preview badges
  const syncChecklistCounts = useCallback((checklists: CardDetailData['checklists']) => {
    let total = 0;
    let checked = 0;
    for (const cl of checklists) {
      total += cl.items.length;
      checked += cl.items.filter((i) => i.checked).length;
    }
    updateCardChecklistStore(cardId, total > 0 ? { total, checked } : null);
  }, [cardId, updateCardChecklistStore]);

  // Fetch card detail
  const fetchCard = async () => {
    try {
      const data = await api.get<{ card: CardDetailData }>(`/cards/${cardId}`);
      setCard(data.card);
      setTitleValue(data.card.name);
      setDescValue(data.card.description ?? '');
      syncChecklistCounts(data.card.checklists);
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
          syncChecklistCounts(data.card.checklists);
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
  }, [cardId, syncChecklistCounts]);

  // Focus title input when editing
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  // Focus desc textarea when editing
  useEffect(() => {
    if (editingDesc) descTextareaRef.current?.focus();
  }, [editingDesc]);

  // Click-outside handler for list picker
  useEffect(() => {
    if (!showListPicker) return;
    function handleMouseDown(e: MouseEvent) {
      if (listPickerRef.current && !listPickerRef.current.contains(e.target as Node)) {
        setShowListPicker(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [showListPicker]);

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
      refreshActivity();
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
      refreshActivity();
    } catch {
      // ignore
    }
  };

  // -- Render --

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-xl max-w-[72rem] w-full p-8 text-center text-gray-500">
        Loading card...
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="bg-white rounded-lg shadow-xl max-w-[72rem] w-full p-8 text-center">
        <p className="text-red-600 mb-4">{error ?? 'Card not found'}</p>
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
          Close
        </button>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-lg shadow-xl max-w-[72rem] w-full max-h-[85vh] overflow-y-auto relative"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Three-dots menu button */}
      <button
        onClick={() => setShowCardMenu((v) => !v)}
        className="absolute top-4 right-12 text-gray-400 hover:text-gray-600 text-xl leading-none z-10"
        title="Card actions"
      >
        &#x22EF;
      </button>
      {showCardMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowCardMenu(false)} />
          <div className="absolute top-12 right-4 z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px]">
            <button
              onClick={async () => {
                setShowCardMenu(false);
                try {
                  await api.patch(`/cards/${card.id}`, { isTemplate: !card.isTemplate });
                  setCard((prev) => prev ? { ...prev, isTemplate: !prev.isTemplate } : prev);
                  // Refresh board to update list view
                  const boardId = useBoardStore.getState().board?.id;
                  if (boardId) {
                    await useBoardStore.getState().fetchBoard(boardId);
                  }
                } catch {}
              }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
              </svg>
              {card.isTemplate ? 'Remove Template' : 'Make Template'}
            </button>
            <button
              onClick={() => {
                setShowCardMenu(false);
                setShowCopyDialog(true);
              }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy Card
            </button>
            <hr className="my-1 border-gray-200" />
            <button
              onClick={() => {
                setShowCardMenu(false);
                handleDelete();
              }}
              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Card
            </button>
          </div>
        </>
      )}

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl leading-none z-10"
        title="Close"
      >
        &times;
      </button>

      {card.coverAttachmentId && (
        <div className="w-full bg-gray-100 rounded-t-lg overflow-hidden" style={{ maxHeight: '200px' }}>
          <img
            src={`/api/v1/attachments/${card.coverAttachmentId}/download`}
            alt="Cover"
            className="w-full object-contain"
            style={{ maxHeight: '200px' }}
          />
        </div>
      )}

      {/* Header */}
      <div className="p-6 pb-2 pr-12">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
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
          </div>
          {card.members.length > 0 && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {card.members.map((member) => (
                <div
                  key={member.id}
                  className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold text-white overflow-hidden"
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
        <div className="relative inline-block" ref={listPickerRef}>
          <button
            onClick={() => setShowListPicker((v) => !v)}
            className="text-sm text-gray-500 mt-1 px-2 -mx-2 hover:bg-gray-100 rounded py-0.5"
          >
            in list <span className="font-medium text-gray-700 underline decoration-dotted">{listName}</span>
          </button>
          {showListPicker && (
            <div className="absolute left-0 top-full mt-1 w-[16rem] bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
              {lists.map((list) => (
                <button
                  key={list.id}
                  onClick={async () => {
                    if (list.id === card.listId) {
                      setShowListPicker(false);
                      return;
                    }
                    try {
                      await api.post(`/cards/${card.id}/move`, { listId: list.id, position: 65536 });
                      setCard((prev) => prev ? { ...prev, listId: list.id } : prev);
                      useBoardStore.getState().moveCardLocally(card.id, card.listId, list.id, 0);
                    } catch {}
                    setShowListPicker(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 ${
                    list.id === card.listId ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  {list.name}
                  {list.id === card.listId && ' (current)'}
                </button>
              ))}
            </div>
          )}
        </div>
        {card.labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2 px-2 -mx-2">
            {card.labels.map((label) => (
              <LabelBadge key={label.id} color={label.color} name={label.name} size="md" />
            ))}
          </div>
        )}
      </div>

      {/* Action buttons bar */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-200">
        {/* Labels */}
        <div className="relative">
          <button
            ref={labelBtnRef}
            onClick={() => setShowLabelPicker((v) => !v)}
            className="flex items-center gap-1.5 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            Labels
          </button>
          {showLabelPicker && (
            <LabelPickerDropdown onClose={() => setShowLabelPicker(false)}>
              <LabelPicker
                cardId={card.id}
                boardId={card.boardId}
                cardLabelIds={card.labels.map((l) => l.id)}
                onClose={() => setShowLabelPicker(false)}
                onToggle={(labelId, added) => {
                  toggleCardLabelStore(card.id, labelId, added);
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
                  refreshActivity();
                }}
              />
            </LabelPickerDropdown>
          )}
        </div>

        {/* Checklist */}
        <button
          onClick={handleAddChecklist}
          className="flex items-center gap-1.5 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Checklist
        </button>

        {/* Members */}
        <div className="relative">
          <button
            onClick={() => setShowMemberPicker((v) => !v)}
            className="flex items-center gap-1.5 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Members
          </button>
          {showMemberPicker && (
            <div className="absolute left-0 mt-1 w-[20rem] bg-white border border-gray-200 rounded-lg shadow-lg z-50">
              <div className="relative">
                <button
                  onClick={() => setShowMemberPicker(false)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-lg leading-none z-10"
                  title="Close"
                >
                  &times;
                </button>
              </div>
              <MemberPicker
                cardId={card.id}
                boardId={card.boardId}
                cardMemberIds={card.members.map((m) => m.id)}
                onToggle={(userId, added) => {
                  toggleCardMemberStore(card.id, userId, added);
                  setCard((prev) => {
                    if (!prev) return prev;
                    if (added) {
                      const member = members.find((m) => m.id === userId);
                      if (!member) return prev;
                      return {
                        ...prev,
                        members: [...prev.members, { id: member.id, username: member.username, displayName: member.displayName, avatarUrl: member.avatarUrl }],
                      };
                    } else {
                      return {
                        ...prev,
                        members: prev.members.filter((m) => m.id !== userId),
                      };
                    }
                  });
                  refreshActivity();
                }}
              />
            </div>
          )}
        </div>

        {/* Attachment */}
        <button
          onClick={() => attachmentFileInputRef.current?.click()}
          className="flex items-center gap-1.5 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          Attachment
        </button>
        <input
          ref={attachmentFileInputRef}
          type="file"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const formData = new FormData();
            formData.append('file', file);
            try {
              await fetch(`/api/v1/cards/${card.id}/attachments`, {
                method: 'POST',
                credentials: 'include',
                body: formData,
              });
              await fetchCard();
            } catch {
              // ignore
            }
            e.target.value = '';
          }}
        />
      </div>

      {/* Body: two-column layout */}
      <div className="flex p-6 pt-4 gap-6">
        {/* Left column: main content */}
        <div className="flex-1 min-w-0">
          {/* Description */}
          <section className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wide">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h10" />
                </svg>
                Description
              </h3>
              {!editingDesc && (
                <button
                  onClick={() => {
                    setDescValue(card.description ?? '');
                    setEditingDesc(true);
                  }}
                  className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded"
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

          {card.checklists.length > 0 && (
            <section className="mb-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Checklists
              </h3>
              {card.checklists.map((cl) => (
                <CardChecklist key={cl.id} checklist={cl} onUpdate={fetchCard} />
              ))}
            </section>
          )}

          <section className="mb-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              Attachments
            </h3>
            <CardAttachments
              cardId={card.id}
              attachments={(card.attachments as any[]) ?? []}
              onRefresh={fetchCard}
              currentUserId={user?.id}
              coverAttachmentId={card.coverAttachmentId}
              onCoverChange={(attachmentId) => {
                setCard((prev) => prev ? { ...prev, coverAttachmentId: attachmentId } : prev);
                const boardId = useBoardStore.getState().board?.id;
                if (boardId) void useBoardStore.getState().fetchBoard(boardId);
              }}
            />
          </section>

        </div>

        {/* Right column: Activity */}
        <div className="w-[24rem] flex-shrink-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Activity
          </h3>
          <CardComments cardId={card.id} />
          <div className="mt-4 border-t border-gray-200 pt-4">
            <ActivityFeed cardId={card.id} refreshKey={activityRefreshKey} />
          </div>
        </div>
      </div>

      {showCopyDialog && (
        <CopyCardDialog
          card={card}
          currentListId={card.listId}
          currentBoardId={card.boardId}
          lists={lists}
          onClose={() => setShowCopyDialog(false)}
          onCopied={async () => {
            setShowCopyDialog(false);
            const boardId = useBoardStore.getState().board?.id;
            if (boardId) {
              await useBoardStore.getState().fetchBoard(boardId);
            }
          }}
        />
      )}
    </div>
  );
}
