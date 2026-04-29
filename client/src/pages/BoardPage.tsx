import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  type DragStartEvent,
  type DragMoveEvent,
  type DragEndEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useBoardStore } from '../stores/boardStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { useBoardSync } from '../hooks/useBoardSync.js';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import List from '../components/board/List.js';
import AddList from '../components/board/AddList.js';
import FontSizeSelector from '../components/common/FontSizeSelector.js';
import SearchBar from '../components/search/SearchBar.js';
import NotificationBell from '../components/notifications/NotificationBell.js';
import FilterPopover from '../components/board/FilterPopover.js';
import Modal from '../components/common/Modal.js';
import CardDetail from '../components/card/CardDetail.js';
import KeyboardShortcutsHelp from '../components/common/KeyboardShortcutsHelp.js';
import AvatarUpload from '../components/common/AvatarUpload.js';
import BackgroundColorPicker from '../components/board/BackgroundColorPicker.js';

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const board = useBoardStore((s) => s.board);
  const lists = useBoardStore((s) => s.lists);
  const labels = useBoardStore((s) => s.labels);
  const members = useBoardStore((s) => s.members);
  const loading = useBoardStore((s) => s.loading);
  const fetchBoard = useBoardStore((s) => s.fetchBoard);
  const clear = useBoardStore((s) => s.clear);
  const moveCard = useBoardStore((s) => s.moveCard);
  const moveCardLocally = useBoardStore((s) => s.moveCardLocally);
  const moveListLocally = useBoardStore((s) => s.moveListLocally);
  const updateList = useBoardStore((s) => s.updateList);
  const updateBoard = useBoardStore((s) => s.updateBoard);
  const { user, logout } = useAuthStore();
  useBoardSync(boardId);

  // Use refs for drag state to avoid re-renders during drag
  const activeIdRef = useRef<string | null>(null);
  // Ref for synchronous access to drag type in collision detection (state updates are async)
  const activeTypeRef = useRef<'card' | 'list' | null>(null);
  // Throttle ref for handleDragOver (~60fps)
  const lastDragOverTime = useRef(0);
  // Minimal state just for the DragOverlay render
  const [dragOverlay, setDragOverlay] = useState<{ id: string; type: 'card' | 'list'; name: string; cardCount?: number } | null>(null);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Drop indicator element (DOM-based for zero re-render cost)
  const dropIndicatorRef = useRef<HTMLDivElement | null>(null);

  // Create drop indicator element once
  useEffect(() => {
    const el = document.createElement('div');
    el.className = 'drop-indicator';
    el.style.cssText = 'height: 3px; background: #3b82f6; border-radius: 3px; margin: 2px 4px; display: none; transition: opacity 0.15s;';
    dropIndicatorRef.current = el;
    return () => {
      el.remove();
      dropIndicatorRef.current = null;
    };
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({ onShowHelp: () => setShowShortcutsHelp(true) });

  // Close filter popover on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilterPopover(false);
      }
    };
    if (showFilterPopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilterPopover]);

  // Card detail from URL
  const cardIdFromUrl = searchParams.get('card');

  // Filters from URL
  const activeLabels = useMemo(() => {
    const val = searchParams.get('labels');
    return val ? val.split(',').filter(Boolean) : [];
  }, [searchParams]);

  const activeMembers = useMemo(() => {
    const val = searchParams.get('members');
    return val ? val.split(',').filter(Boolean) : [];
  }, [searchParams]);

  const hasFilters = activeLabels.length > 0 || activeMembers.length > 0;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  // Clear board data only when leaving the page (boardId changes or unmount)
  useEffect(() => {
    return () => clear();
  }, [boardId, clear]);

  // Fetch/refetch board whenever filters change
  const labelsKey = searchParams.get('labels') ?? '';
  const membersKey = searchParams.get('members') ?? '';

  useEffect(() => {
    if (boardId) {
      const filters: { labels?: string[]; members?: string[] } = {};
      if (activeLabels.length) filters.labels = activeLabels;
      if (activeMembers.length) filters.members = activeMembers;
      fetchBoard(boardId, Object.keys(filters).length ? filters : undefined);
    }
  }, [boardId, fetchBoard, labelsKey, membersKey]);

  // Filter toggle handlers
  const handleToggleLabel = useCallback(
    (labelId: string) => {
      const newParams = new URLSearchParams(searchParams);
      const current = newParams.get('labels')?.split(',').filter(Boolean) ?? [];
      const updated = current.includes(labelId)
        ? current.filter((id) => id !== labelId)
        : [...current, labelId];
      if (updated.length) {
        newParams.set('labels', updated.join(','));
      } else {
        newParams.delete('labels');
      }
      setSearchParams(newParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleToggleMember = useCallback(
    (memberId: string) => {
      const newParams = new URLSearchParams(searchParams);
      const current = newParams.get('members')?.split(',').filter(Boolean) ?? [];
      const updated = current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId];
      if (updated.length) {
        newParams.set('members', updated.join(','));
      } else {
        newParams.delete('members');
      }
      setSearchParams(newParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleClearFilters = useCallback(() => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('labels');
    newParams.delete('members');
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleCloseCardDetail = useCallback(() => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('card');
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const sortedLists = useMemo(
    () => [...lists].sort((a, b) => a.position - b.position),
    [lists],
  );

  const listIdsRef = useRef<string[]>([]);
  const listIds = useMemo(() => {
    const newIds = sortedLists.map((l) => `list-${l.id}`);
    // Structural comparison: return same reference if content hasn't changed
    if (
      newIds.length === listIdsRef.current.length &&
      newIds.every((id, i) => id === listIdsRef.current[i])
    ) {
      return listIdsRef.current;
    }
    listIdsRef.current = newIds;
    return newIds;
  }, [sortedLists]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    if (dropIndicatorRef.current) dropIndicatorRef.current.style.display = 'none';
    const idStr = active.id as string;
    if (idStr.startsWith('card-')) {
      const cardId = idStr.slice(5);
      activeIdRef.current = cardId;
      activeTypeRef.current = 'card';
      // Find card name for overlay (read from store directly, no re-render)
      const currentLists = useBoardStore.getState().lists;
      for (const list of currentLists) {
        const card = list.cards.find((c) => c.id === cardId);
        if (card) {
          setDragOverlay({ id: cardId, type: 'card', name: card.name });
          break;
        }
      }
    } else if (idStr.startsWith('list-')) {
      const listId = idStr.slice(5);
      activeIdRef.current = listId;
      activeTypeRef.current = 'list';
      const currentLists = useBoardStore.getState().lists;
      const list = currentLists.find((l) => l.id === listId);
      if (list) {
        setDragOverlay({ id: listId, type: 'list', name: list.name, cardCount: list.cards.length });
      }
    }
  }, []);

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      // Throttle to ~60fps
      const now = Date.now();
      if (now - lastDragOverTime.current < 16) return;
      lastDragOverTime.current = now;

      const { active, over } = event;
      if (!over) {
        // Hide indicator when not over any droppable
        if (dropIndicatorRef.current) dropIndicatorRef.current.style.display = 'none';
        return;
      }

      const activeIdStr = active.id as string;
      const overIdStr = over.id as string;

      if (!activeIdStr.startsWith('card-')) return;
      if (!overIdStr.startsWith('list-')) return;

      const activeCardId = activeIdStr.slice(5);
      const overListId = overIdStr.slice(5);

      // Read current state directly from store
      const currentLists = useBoardStore.getState().lists;

      // Find which list currently contains the active card
      let fromListId: string | null = null;
      for (const list of currentLists) {
        if (list.cards.some((c) => c.id === activeCardId)) {
          fromListId = list.id;
          break;
        }
      }
      if (!fromListId) return;

      // Calculate insertion index from pointer position
      const pointerY = (event.activatorEvent as PointerEvent).clientY + event.delta.y;
      const listEl = document.querySelector(`[data-list-id="${overListId}"]`);
      let insertIndex = 0;
      if (listEl) {
        const cardEls = listEl.querySelectorAll('[data-card-id]');
        for (const el of cardEls) {
          const elCardId = el.getAttribute('data-card-id');
          if (elCardId === activeCardId) continue; // skip the dragged card
          const rect = el.getBoundingClientRect();
          if (pointerY > rect.top + rect.height / 2) {
            insertIndex++;
          } else {
            break;
          }
        }
      }

      // Position the drop indicator
      if (dropIndicatorRef.current && listEl) {
        const indicator = dropIndicatorRef.current;
        const cardEls = Array.from(listEl.querySelectorAll('[data-card-id]'));
        // Build list of non-dragged card elements
        const visibleCards = cardEls.filter(el => el.getAttribute('data-card-id') !== activeCardId);
        if (insertIndex < visibleCards.length) {
          visibleCards[insertIndex].before(indicator);
        } else {
          // After the last card (but before AddCard)
          const lastCard = cardEls[cardEls.length - 1];
          if (lastCard) {
            lastCard.after(indicator);
          } else {
            listEl.prepend(indicator);
          }
        }
        indicator.style.display = 'block';
      }

      // For same-list: check if position actually changed to avoid unnecessary updates
      if (fromListId === overListId) {
        const list = currentLists.find((l) => l.id === fromListId);
        if (list) {
          const currentIndex = list.cards.findIndex((c) => c.id === activeCardId);
          if (insertIndex === currentIndex) return;
        }
      }

      moveCardLocally(activeCardId, fromListId, overListId, insertIndex);
    },
    [moveCardLocally],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      // Hide drop indicator
      if (dropIndicatorRef.current) dropIndicatorRef.current.style.display = 'none';

      // Clean up drag state
      activeIdRef.current = null;
      activeTypeRef.current = null;
      setDragOverlay(null);

      const activeIdStr = active.id as string;

      // Read current state directly from store
      const currentLists = useBoardStore.getState().lists;

      // ── List reorder ─────────────────────────────────────────────
      if (over && activeIdStr.startsWith('list-') && (over.id as string).startsWith('list-')) {
        const activeListId = activeIdStr.slice(5);
        const overListId = (over.id as string).slice(5);
        if (activeListId === overListId) return;

        const sorted = [...currentLists].sort((a, b) => a.position - b.position);
        const overIndex = sorted.findIndex((l) => l.id === overListId);
        if (overIndex === -1) return;

        const newPosition = moveListLocally(activeListId, overIndex);
        try {
          await updateList(activeListId, { position: newPosition });
        } catch {
          if (boardId) fetchBoard(boardId);
        }
        return;
      }

      // ── Card drop — always persist since handleDragOver may have moved it ──
      if (activeIdStr.startsWith('card-')) {
        const activeCardId = activeIdStr.slice(5);

        // Find the card's current list and position (already moved by handleDragOver)
        for (const list of currentLists) {
          const card = list.cards.find((c) => c.id === activeCardId);
          if (card) {
            try {
              await moveCard(activeCardId, list.id, card.position);
            } catch {
              if (boardId) fetchBoard(boardId);
            }
            break;
          }
        }
      }
    },
    [boardId, moveListLocally, moveCard, updateList, fetchBoard],
  );

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const dragType = activeTypeRef.current;
    if (dragType === 'list') {
      return closestCenter(args);
    }
    // For cards: use pointerWithin (containment) — much more accurate for list-level droppables
    const within = pointerWithin(args);
    if (within.length > 0) return within;
    // Fallback to closestCenter if pointer isn't inside any list
    return closestCenter(args);
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-500">Loading board...</div>;
  }

  if (!board) {
    return <div className="flex items-center justify-center min-h-screen text-gray-500">Board not found</div>;
  }

  const bgStyle = board.backgroundType === 'color'
    ? { backgroundColor: board.backgroundValue }
    : { backgroundImage: `url(${board.backgroundValue})`, backgroundSize: 'cover' };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col" style={bgStyle}>
      <header className="bg-black/30 text-white px-4 py-2 flex items-center justify-between backdrop-blur-sm">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => navigate(`/w/${board.workspaceId}`)}
            className="text-sm hover:underline opacity-80 whitespace-nowrap"
          >
            &larr; Boards
          </button>
          <h1 className="text-lg font-bold truncate">{board.name}</h1>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <BackgroundColorPicker
            currentColor={board.backgroundValue}
            onColorChange={(color) => updateBoard(board.id, { backgroundType: 'color', backgroundValue: color })}
          />
          <SearchBar />
          {/* Filter button */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilterPopover(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                hasFilters
                  ? 'bg-blue-500/30 text-white'
                  : 'bg-white/20 hover:bg-white/30 text-white'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filter
              {hasFilters && (
                <span className="bg-white text-blue-600 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {activeLabels.length + activeMembers.length}
                </span>
              )}
            </button>
            {showFilterPopover && (
              <FilterPopover
                labels={labels}
                members={members}
                activeLabels={activeLabels}
                activeMembers={activeMembers}
                onToggleLabel={handleToggleLabel}
                onToggleMember={handleToggleMember}
                onClose={() => setShowFilterPopover(false)}
              />
            )}
          </div>
          {hasFilters && (
            <button
              onClick={handleClearFilters}
              className="text-xs text-white/70 hover:text-white underline"
            >
              Clear filters
            </button>
          )}
          <FontSizeSelector />
          <NotificationBell />
          <AvatarUpload />
          <span className="text-sm">{user?.displayName}</span>
          <button
            onClick={() => navigate('/admin/users')}
            className="text-sm hover:underline opacity-80"
          >
            Users
          </button>
          <button onClick={handleLogout} className="text-sm hover:underline opacity-80">
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-x-auto p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={listIds} strategy={horizontalListSortingStrategy}>
            <div className="flex gap-3 items-start h-full">
              {sortedLists.map((list) => (
                <List key={list.id} list={list} />
              ))}
              <AddList boardId={board.id} />
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {dragOverlay?.type === 'card' ? (
              <div className="bg-white rounded-lg shadow-lg px-3 py-2 w-[27rem] rotate-2">
                <span className="text-sm text-gray-800">{dragOverlay.name}</span>
              </div>
            ) : null}
            {dragOverlay?.type === 'list' ? (
              <div className="bg-gray-200 rounded-xl w-[27rem] px-3 py-2 shadow-lg rotate-2 opacity-90">
                <h3 className="font-semibold text-sm text-gray-800">{dragOverlay.name}</h3>
                <div className="text-sm text-gray-500 mt-1">
                  {dragOverlay.cardCount} card{dragOverlay.cardCount !== 1 ? 's' : ''}
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

      {/* Card detail modal opened via URL param */}
      {cardIdFromUrl && (
        <Modal isOpen={true} onClose={handleCloseCardDetail}>
          <CardDetail cardId={cardIdFromUrl} onClose={handleCloseCardDetail} />
        </Modal>
      )}

      <KeyboardShortcutsHelp isOpen={showShortcutsHelp} onClose={() => setShowShortcutsHelp(false)} />
    </div>
  );
}
