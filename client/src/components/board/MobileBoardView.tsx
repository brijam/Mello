// Mello iOS — mobile-optimized board view.
//
// Layout: one list visible at a time with a sticky tab strip. The active list
// renders inside an inner scroll container (separate from window scroll) so
// pulling out the drag rail doesn't move the page. Cards reorder during drag
// using dnd-kit's SortableContext so neighbors visibly slide; the active card
// stays visible as a placeholder (faded, no rotation) and a DragOverlay
// follows the finger.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  TouchSensor,
  MouseSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBoardStore } from '../../stores/boardStore.js';
import LabelBadge from './LabelBadge.js';
import MobileBottomBar, { Icon, useCommonActions } from '../mobile/MobileBottomBar.js';
import MobileListMenu, {
  Sheet,
  SheetHeader,
  CancelRow,
} from '../mobile/MobileListMenu.js';
import MobileNotificationsSheet from '../mobile/MobileNotificationsSheet.js';
import MobileSearchSheet from '../mobile/MobileSearchSheet.js';
import MobileNewCard from '../mobile/MobileNewCard.js';
import MobileCardSheet from '../mobile/MobileCardSheet.js';
import {
  D,
  MOBILE_FONT_STACK,
  MOBILE_PALETTE,
  boardAccentColor,
  listAccentColor,
  hexToRgba,
} from '../mobile/mobileTheme.js';

interface CardSummary {
  id: string;
  listId: string;
  boardId: string;
  name: string;
  description: string | null;
  position: number;
  labelIds: string[];
  memberIds: string[];
  checklistItems: { total: number; checked: number } | null;
  attachmentCount: number;
  commentCount: number;
  isTemplate: boolean;
  coverAttachmentId: string | null;
}

interface ListWithCards {
  id: string;
  name: string;
  color?: string | null;
  position: number;
  cards: CardSummary[];
}

interface MobileBoardViewProps {
  boardId: string;
  boardName: string;
  workspaceId: string;
  lists: ListWithCards[];
}

export default function MobileBoardView({
  boardId,
  boardName,
  workspaceId,
  lists,
}: MobileBoardViewProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const board = useBoardStore((s) => s.board);
  const moveCard = useBoardStore((s) => s.moveCard);
  const moveCardLocally = useBoardStore((s) => s.moveCardLocally);
  const addList = useBoardStore((s) => s.addList);

  const sortedLists = useMemo(
    () => [...lists].sort((a, b) => a.position - b.position),
    [lists],
  );

  const [activeListId, setActiveListId] = useState<string | null>(
    sortedLists[0]?.id ?? null,
  );
  const validActiveId = useMemo(() => {
    if (activeListId && sortedLists.some((l) => l.id === activeListId)) return activeListId;
    return sortedLists[0]?.id ?? null;
  }, [activeListId, sortedLists]);

  const activeList = sortedLists.find((l) => l.id === validActiveId) ?? null;
  const activeIndex = sortedLists.findIndex((l) => l.id === validActiveId);

  const sortedCards = useMemo(
    () => (activeList ? [...activeList.cards].sort((a, b) => a.position - b.position) : []),
    [activeList],
  );

  // ── Sheets / overlays ───────────────────────────────────────────────
  const [showInbox, setShowInbox] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showNewCard, setShowNewCard] = useState(false);
  const [showListMenu, setShowListMenu] = useState(false);
  const [showAddList, setShowAddList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [addingList, setAddingList] = useState(false);

  // ── Drag state ──────────────────────────────────────────────────────
  const [dragOverlayCard, setDragOverlayCard] = useState<CardSummary | null>(null);
  // Distance-based touch sensor on the grab rail (touchAction: 'none') so
  // vertical scrolling on the card body itself doesn't trigger reorder.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const idStr = event.active.id as string;
      if (!idStr.startsWith('mcard-')) return;
      const cardId = idStr.slice(6);
      const card = sortedCards.find((c) => c.id === cardId);
      if (card) setDragOverlayCard(card);
    },
    [sortedCards],
  );

  // We let SortableContext handle the visual animation, but apply the actual
  // list update on drag end (single store mutation, no thrashing). Same-list
  // reorder only: cross-list drag is reserved for the desktop view.
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setDragOverlayCard(null);
      if (!over || !activeList) return;
      const activeIdStr = active.id as string;
      const overIdStr = over.id as string;
      if (!activeIdStr.startsWith('mcard-') || !overIdStr.startsWith('mcard-')) return;
      const activeCardId = activeIdStr.slice(6);
      const overCardId = overIdStr.slice(6);
      if (activeCardId === overCardId) return;

      const currentLists = useBoardStore.getState().lists;
      const list = currentLists.find((l) => l.id === activeList.id);
      if (!list) return;
      const sorted = [...list.cards].sort((a, b) => a.position - b.position);
      const newIndex = sorted.findIndex((c) => c.id === overCardId);
      if (newIndex < 0) return;

      const newPosition = moveCardLocally(
        activeCardId,
        activeList.id,
        activeList.id,
        newIndex,
      );
      try {
        await moveCard(activeCardId, activeList.id, newPosition);
      } catch {
        await useBoardStore.getState().fetchBoard(boardId);
      }
    },
    [activeList, moveCardLocally, moveCard, boardId],
  );

  const openCard = useCallback(
    (cardId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('card', cardId);
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  const cardIdFromUrl = searchParams.get('card');
  const closeCard = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('card');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const activeTab = showInbox ? 'notifications' : showSearch ? 'search' : null;
  const common = useCommonActions({
    workspaceId,
    activeTab,
    onNotifications: () => {
      setShowSearch(false);
      setShowInbox((v) => !v);
    },
    onSearch: () => {
      setShowInbox(false);
      setShowSearch((v) => !v);
    },
  });

  // The board's accent dot: defaults to backgroundValue when board uses a
  // color background; falls back to a configurable accentColor otherwise.
  const headerAccent = boardAccentColor(
    board as unknown as { accentColor: string | null; backgroundType: string; backgroundValue: string } | null,
  );

  // Lock the body so window scroll never moves during drag and so the list
  // scroll stays contained. This sidesteps the "drag resets the page to the
  // top" bug seen when sortable updates re-layout the document.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="flex flex-col"
      style={{
        background: D.bg,
        color: D.ink,
        height: '100dvh',
        fontFamily: MOBILE_FONT_STACK,
        WebkitFontSmoothing: 'antialiased',
        overflow: 'hidden',
      }}
    >
      {/* Top bar — board name with board accent dot */}
      <header
        className="flex items-center px-3"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 10px)',
          paddingBottom: 8,
          background: D.bg,
          borderBottom: `0.5px solid ${D.hair}`,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => navigate(`/w/${workspaceId}`)}
          aria-label="Back to workspace"
          style={{
            background: 'transparent',
            border: 'none',
            padding: 8,
            color: D.ink,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg width="11" height="18" viewBox="0 0 11 18" fill="none">
            <path
              d="M9 1L2 9l7 8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="flex-1 text-center" style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: -0.2,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              maxWidth: '100%',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: headerAccent,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {boardName}
            </span>
          </div>
        </div>
        <button
          onClick={() => activeList && setShowListMenu(true)}
          aria-label="List menu"
          disabled={!activeList}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 8,
            color: activeList ? D.ink2 : D.mute2,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: activeList ? 'pointer' : 'default',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="6" cy="12" r="1.6" fill="currentColor" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" />
            <circle cx="18" cy="12" r="1.6" fill="currentColor" />
          </svg>
        </button>
      </header>

      {/* Sticky list-tab strip */}
      <div
        style={{
          background: D.bg,
          paddingTop: 10,
          paddingBottom: 10,
          borderBottom: `1px solid ${D.hair}`,
          flexShrink: 0,
        }}
      >
        <div
          className="flex gap-1.5 px-3"
          style={{
            overflowX: 'auto',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {sortedLists.map((l, i) => {
            const on = l.id === validActiveId;
            // A colored list tints its pill so picking a color visibly recolors
            // the list; uncolored lists keep the neutral surface treatment.
            const pillBg = l.color
              ? hexToRgba(l.color, on ? 0.28 : 0.14)
              : on
                ? D.surface2
                : 'transparent';
            const pillBorder = l.color
              ? hexToRgba(l.color, on ? 0.75 : 0.4)
              : on
                ? D.hair2
                : 'transparent';
            return (
              <button
                key={l.id}
                onClick={() => setActiveListId(l.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 14px',
                  background: pillBg,
                  color: on ? D.ink : D.mute,
                  fontSize: 14,
                  fontWeight: on ? 600 : 500,
                  letterSpacing: -0.1,
                  flexShrink: 0,
                  borderRadius: 10,
                  border: `0.5px solid ${pillBorder}`,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontFamily: MOBILE_FONT_STACK,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    background: listAccentColor(l, i),
                    opacity: on ? 1 : 0.7,
                  }}
                />
                {l.name}
              </button>
            );
          })}
          <button
            onClick={() => setShowAddList(true)}
            aria-label="Add list"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 38,
              padding: '0 0',
              background: 'transparent',
              color: D.mute,
              border: `0.5px dashed ${D.hair3}`,
              borderRadius: 10,
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Active list — separate scroll container so drag never moves window scroll */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          paddingBottom: 88, // clear the bottom bar
        }}
      >
        {activeList ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div
              className="flex items-center"
              style={{
                margin: '12px 12px 4px',
                padding: '10px 14px',
                borderRadius: 12,
                // Tint the active list's header with its chosen color so the
                // color change is clearly visible, not just a tiny dot. Uncolored
                // lists keep their original plain header (no accent strip).
                background: activeList.color ? hexToRgba(activeList.color, 0.16) : 'transparent',
                borderLeft: `3px solid ${activeList.color ?? 'transparent'}`,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: activeList.color ? D.ink2 : D.mute,
                  fontWeight: 600,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: listAccentColor(activeList, activeIndex),
                  }}
                />
                {activeList.name}
                <span style={{ color: D.mute2, marginLeft: 4 }}>
                  · {sortedCards.length}
                </span>
              </div>
            </div>

            <SortableContext
              items={sortedCards.map((c) => `mcard-${c.id}`)}
              strategy={verticalListSortingStrategy}
            >
              <div
                data-mobile-list-id={activeList.id}
                className="flex flex-col gap-2 px-3"
              >
                {sortedCards.map((c) => (
                  <MobileCard
                    key={c.id}
                    card={c}
                    onOpen={() => openCard(c.id)}
                  />
                ))}
                {sortedCards.length === 0 && (
                  <div
                    style={{
                      padding: 30,
                      color: D.mute,
                      textAlign: 'center',
                      fontSize: 14,
                    }}
                  >
                    No cards in this list. Tap + below to add one.
                  </div>
                )}
              </div>
            </SortableContext>

            <DragOverlay dropAnimation={null}>
              {dragOverlayCard ? (
                <div
                  style={{
                    background: D.surface,
                    border: `0.5px solid ${D.sky}`,
                    borderRadius: 12,
                    boxShadow:
                      '0 14px 30px rgba(0,0,0,0.45), 0 0 0 1px rgba(91,168,255,0.25)',
                    padding: '12px 14px',
                    transform: 'rotate(-0.6deg)',
                    color: D.ink,
                    fontSize: 15,
                    fontWeight: 500,
                    letterSpacing: -0.2,
                    maxWidth: 340,
                  }}
                >
                  {dragOverlayCard.name}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <div
            className="flex items-center justify-center"
            style={{ color: D.mute, fontSize: 14, padding: 60 }}
          >
            No lists yet — tap + to create one.
          </div>
        )}
      </div>

      <MobileBottomBar
        actions={[
          common.boards(),
          common.notifications(),
          common.search(),
          {
            key: 'add',
            label: 'New card',
            icon: Icon.PlusCircle,
            variant: 'primary',
            onClick: () => activeList && setShowNewCard(true),
          },
          {
            key: 'list',
            label: 'List',
            icon: Icon.More,
            onClick: () => activeList && setShowListMenu(true),
          },
        ]}
      />

      {showInbox && <MobileNotificationsSheet onClose={() => setShowInbox(false)} />}
      {showSearch && <MobileSearchSheet onClose={() => setShowSearch(false)} />}
      {showNewCard && activeList && (
        <MobileNewCard
          listId={activeList.id}
          listName={activeList.name}
          onClose={() => setShowNewCard(false)}
        />
      )}
      {showListMenu && activeList && (
        <MobileListMenu
          list={{ id: activeList.id, name: activeList.name, color: activeList.color ?? null }}
          onClose={() => setShowListMenu(false)}
        />
      )}
      {showAddList && (
        <Sheet onClose={() => !addingList && setShowAddList(false)}>
          <SheetHeader title="New list" />
          <div style={{ padding: '8px 16px 16px' }}>
            <input
              autoFocus
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="List title"
              style={{
                width: '100%',
                background: D.surface2,
                color: D.ink,
                border: `0.5px solid ${D.hair3}`,
                borderRadius: 10,
                padding: '12px 14px',
                fontSize: 16,
                fontFamily: MOBILE_FONT_STACK,
                outline: 'none',
              }}
              onKeyDown={async (e) => {
                if (e.key === 'Escape') setShowAddList(false);
                if (e.key === 'Enter') {
                  const n = newListName.trim();
                  if (!n) return;
                  setAddingList(true);
                  try {
                    await addList(boardId, n);
                    setNewListName('');
                    setShowAddList(false);
                  } finally {
                    setAddingList(false);
                  }
                }
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                disabled={!newListName.trim() || addingList}
                onClick={async () => {
                  const n = newListName.trim();
                  if (!n) return;
                  setAddingList(true);
                  try {
                    await addList(boardId, n);
                    setNewListName('');
                    setShowAddList(false);
                  } finally {
                    setAddingList(false);
                  }
                }}
                style={{
                  flex: 1,
                  background: newListName.trim() ? D.sky : D.surface2,
                  color: newListName.trim() ? '#0A0A0A' : D.mute,
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px 0',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: newListName.trim() ? 'pointer' : 'default',
                  fontFamily: MOBILE_FONT_STACK,
                }}
              >
                {addingList ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
          <CancelRow onClick={() => setShowAddList(false)} />
        </Sheet>
      )}
      {cardIdFromUrl && <MobileCardSheet cardId={cardIdFromUrl} onClose={closeCard} />}
    </div>
  );
}

interface MobileCardProps {
  card: CardSummary;
  onOpen: () => void;
}

function MobileCard({ card, onOpen }: MobileCardProps) {
  const labels = useBoardStore((s) => s.labels);
  const members = useBoardStore((s) => s.members);
  const cardLabels = useMemo(
    () => labels.filter((l) => card.labelIds?.includes(l.id)),
    [labels, card.labelIds],
  );
  const cardMembers = useMemo(
    () => members.filter((m) => card.memberIds?.includes(m.id)),
    [members, card.memberIds],
  );

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `mcard-${card.id}`,
    data: { type: 'card', card, listId: card.listId },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    display: 'flex',
    background: D.surface,
    borderRadius: 12,
    border: `0.5px solid ${isDragging ? D.sky : D.hair}`,
    overflow: 'hidden',
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div ref={setNodeRef} data-mcard-id={card.id} style={style}>
      {/* DRAG RAIL — the only drag affordance */}
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        role="button"
        style={{
          width: 30,
          flexShrink: 0,
          background: D.surface2,
          borderRight: `0.5px solid ${D.hair}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab',
          touchAction: 'none',
          alignSelf: 'stretch',
        }}
      >
        <svg width="6" height="14" viewBox="0 0 6 14" fill="none">
          {[2, 7, 12].map((y) => (
            <g key={y}>
              <circle cx="1.4" cy={y} r="1.1" fill={D.mute2} />
              <circle cx="4.6" cy={y} r="1.1" fill={D.mute2} />
            </g>
          ))}
        </svg>
      </div>

      {/* Card body — tap to open */}
      <button
        type="button"
        onClick={onOpen}
        style={{
          flex: 1,
          textAlign: 'left',
          padding: '12px 14px',
          background: 'transparent',
          border: 'none',
          color: D.ink,
          cursor: 'pointer',
          minWidth: 0,
          fontFamily: MOBILE_FONT_STACK,
        }}
      >
        {card.coverAttachmentId && (
          <div
            style={{
              margin: '-12px -14px 10px',
              height: 96,
              backgroundImage: `url(/api/v1/attachments/${card.coverAttachmentId}/download)`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        )}

        {cardLabels.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginBottom: 7,
            }}
          >
            {cardLabels.map((l) => (
              <LabelBadge key={l.id} color={l.color} name={l.name} size="sm" />
            ))}
          </div>
        )}

        <div
          style={{
            fontSize: 15,
            fontWeight: 500,
            color: D.ink,
            letterSpacing: -0.2,
            lineHeight: 1.3,
            whiteSpace: 'normal',
            wordBreak: 'break-word',
          }}
        >
          {card.name}
        </div>

        {(card.description ||
          card.commentCount > 0 ||
          card.attachmentCount > 0 ||
          card.checklistItems ||
          cardMembers.length > 0) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: 10,
              gap: 14,
              color: D.mute,
              fontSize: 12,
            }}
          >
            {card.checklistItems && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontWeight: 500,
                  color:
                    card.checklistItems.checked === card.checklistItems.total &&
                    card.checklistItems.total > 0
                      ? MOBILE_PALETTE[3]
                      : D.mute,
                }}
              >
                <svg width="11" height="9" viewBox="0 0 12 9" fill="none">
                  <path
                    d="M1 4.5L4.5 8 11 1"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {card.checklistItems.checked}/{card.checklistItems.total}
              </span>
            )}
            {card.attachmentCount > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M10 3.5L5.5 8a2 2 0 01-2.8-2.8L7 .9a3 3 0 014.2 4.2L7 9.4"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {card.attachmentCount}
              </span>
            )}
            {card.commentCount > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <svg width="12" height="11" viewBox="0 0 13 12" fill="none">
                  <path
                    d="M1 5.5C1 2.8 3.3 1 6.5 1S12 2.8 12 5.5 9.7 10 6.5 10c-.7 0-1.4-.1-2-.3L2 11l.7-2.3C1.6 7.8 1 6.7 1 5.5z"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                </svg>
                {card.commentCount}
              </span>
            )}
            {card.description && (
              <span aria-label="Has description" style={{ display: 'inline-flex', alignItems: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2 3h8M2 6h8M2 9h5"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            )}
            <div style={{ flex: 1 }} />
            {cardMembers.length > 0 && (
              <div style={{ display: 'flex' }}>
                {cardMembers.slice(0, 3).map((m, i) => (
                  <div
                    key={m.id}
                    style={{
                      marginLeft: i ? -6 : 0,
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      background: ['#3A3A3A', '#264158', '#4A395E'][i % 3],
                      boxShadow: `0 0 0 2px ${D.surface}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9,
                      fontWeight: 600,
                      color: D.ink,
                      overflow: 'hidden',
                    }}
                    title={m.displayName}
                  >
                    {m.avatarUrl ? (
                      <img
                        src={m.avatarUrl}
                        alt={m.displayName}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      m.displayName.charAt(0).toUpperCase()
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </button>
    </div>
  );
}
