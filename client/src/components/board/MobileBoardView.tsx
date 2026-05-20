// Mello iOS — mobile-optimized board view.
// One list visible at a time (sticky tabs at top). Each card has a left-edge
// drag rail as the ONLY drag affordance, so vertical scrolling on the card
// body never triggers a reorder.

import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  TouchSensor,
  MouseSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragMoveEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useBoardStore } from '../../stores/boardStore.js';
import LabelBadge from './LabelBadge.js';
import AddCard from './AddCard.js';

const D = {
  bg: '#0A0A0A',
  surface: '#141414',
  surface2: '#1C1C1C',
  hair: '#222222',
  hair2: '#2A2A2A',
  ink: '#F5F5F5',
  ink2: '#D4D4D4',
  mute: '#8A8A8A',
  mute2: '#555555',
  sky: '#5BA8FF',
  coral: '#FF6B5B',
  lime: '#B8FF5B',
  violet: '#A88FFF',
  amber: '#FFB85B',
};

const DOT_PALETTE = [D.coral, D.sky, D.amber, D.lime, D.violet];
const listDot = (index: number) => DOT_PALETTE[index % DOT_PALETTE.length];

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
  const moveCard = useBoardStore((s) => s.moveCard);
  const moveCardLocally = useBoardStore((s) => s.moveCardLocally);

  const sortedLists = useMemo(
    () => [...lists].sort((a, b) => a.position - b.position),
    [lists],
  );

  const [activeListId, setActiveListId] = useState<string | null>(
    sortedLists[0]?.id ?? null,
  );
  // If lists arrive after first render or the active one is deleted, recover.
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

  // Drag state
  const [dragOverlayCard, setDragOverlayCard] = useState<CardSummary | null>(null);
  const lastDragOverTime = useRef(0);

  // Distance-based touch sensor — explicit grip means no press-and-hold delay.
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

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const now = Date.now();
      if (now - lastDragOverTime.current < 16) return;
      lastDragOverTime.current = now;

      const { active, over } = event;
      if (!over || !activeList) return;
      const activeIdStr = active.id as string;
      if (!activeIdStr.startsWith('mcard-')) return;
      const activeCardId = activeIdStr.slice(6);

      const pointerY =
        (event.activatorEvent as PointerEvent).clientY + event.delta.y;
      const listEl = document.querySelector(
        `[data-mobile-list-id="${activeList.id}"]`,
      );
      if (!listEl) return;

      const cardEls = listEl.querySelectorAll('[data-mcard-id]');
      let insertIndex = 0;
      for (const el of cardEls) {
        const elId = el.getAttribute('data-mcard-id');
        if (elId === activeCardId) continue;
        const rect = el.getBoundingClientRect();
        if (pointerY > rect.top + rect.height / 2) {
          insertIndex++;
        } else {
          break;
        }
      }

      const currentLists = useBoardStore.getState().lists;
      const list = currentLists.find((l) => l.id === activeList.id);
      if (!list) return;
      const currentIndex = list.cards
        .slice()
        .sort((a, b) => a.position - b.position)
        .findIndex((c) => c.id === activeCardId);
      if (currentIndex === insertIndex) return;

      moveCardLocally(activeCardId, activeList.id, activeList.id, insertIndex);
    },
    [activeList, moveCardLocally],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const idStr = event.active.id as string;
      setDragOverlayCard(null);
      if (!idStr.startsWith('mcard-')) return;
      const cardId = idStr.slice(6);
      const currentLists = useBoardStore.getState().lists;
      const list = currentLists.find((l) =>
        l.cards.some((c) => c.id === cardId),
      );
      if (!list) return;
      const card = list.cards.find((c) => c.id === cardId);
      if (!card) return;
      try {
        await moveCard(cardId, list.id, card.position);
      } catch {
        const refresh = useBoardStore.getState().fetchBoard;
        await refresh(boardId);
      }
    },
    [moveCard, boardId],
  );

  const openCard = useCallback(
    (cardId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('card', cardId);
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  return (
    <div
      className="flex flex-col"
      style={{
        background: D.bg,
        color: D.ink,
        minHeight: '100dvh',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* Top bar — restrained, board name centered with list dot */}
      <header
        className="flex items-center px-3"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 10px)',
          paddingBottom: 8,
          background: D.bg,
          borderBottom: `0.5px solid ${D.hair}`,
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
                width: 6,
                height: 6,
                borderRadius: 3,
                background: listDot(Math.max(0, activeIndex)),
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
        <div style={{ width: 36 }} />
      </header>

      {/* Sticky list-tab strip */}
      <div
        className="sticky top-0 z-10"
        style={{
          background: D.bg,
          paddingTop: 12,
          paddingBottom: 10,
          borderBottom: `1px solid ${D.hair}`,
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
            return (
              <button
                key={l.id}
                onClick={() => setActiveListId(l.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 14px',
                  background: on ? D.surface2 : 'transparent',
                  color: on ? D.ink : D.mute,
                  fontSize: 14,
                  fontWeight: on ? 600 : 500,
                  letterSpacing: -0.1,
                  flexShrink: 0,
                  borderRadius: 10,
                  border: `0.5px solid ${on ? D.hair2 : 'transparent'}`,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    background: listDot(i),
                    opacity: on ? 1 : 0.7,
                  }}
                />
                {l.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active list */}
      {activeList ? (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
        >
          <div
            className="flex-1"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
          >
            <div
              className="flex items-center"
              style={{ padding: '14px 22px 10px' }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: D.mute,
                  fontWeight: 500,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                }}
              >
                {activeList.name}
              </div>
            </div>

            <MobileListDroppable listId={activeList.id}>
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
                <div
                  style={{
                    marginTop: 6,
                    background: 'transparent',
                    border: `1px dashed ${D.hair2}`,
                    color: D.mute,
                    fontSize: 14,
                    fontWeight: 500,
                    padding: 4,
                    borderRadius: 12,
                  }}
                >
                  <div className="[&_button]:!text-[color:#8A8A8A] [&_textarea]:!bg-[#141414] [&_textarea]:!text-[#F5F5F5] [&_textarea]:!border-[#2A2A2A]">
                    <AddCard listId={activeList.id} />
                  </div>
                </div>
              </div>
            </MobileListDroppable>
          </div>

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
          className="flex-1 flex items-center justify-center"
          style={{ color: D.mute, fontSize: 14 }}
        >
          No lists yet
        </div>
      )}
    </div>
  );
}

function MobileListDroppable({
  listId,
  children,
}: {
  listId: string;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: `mlist-${listId}` });
  return <div ref={setNodeRef}>{children}</div>;
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

  const { attributes, listeners, setNodeRef, isDragging, setActivatorNodeRef } =
    useDraggable({
      id: `mcard-${card.id}`,
      data: { type: 'card', card, listId: card.listId },
    });

  return (
    <div
      ref={setNodeRef}
      data-mcard-id={card.id}
      style={{
        display: 'flex',
        background: D.surface,
        borderRadius: 12,
        border: `0.5px solid ${D.hair}`,
        overflow: 'hidden',
        opacity: isDragging ? 0 : 1,
      }}
    >
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

      {/* Card body — tap to open, scroll passes through */}
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
                      ? D.lime
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
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
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
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
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
              <span
                aria-label="Has description"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
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
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
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
