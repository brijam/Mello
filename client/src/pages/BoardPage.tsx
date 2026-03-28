import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
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
import FilterBar from '../components/board/FilterBar.js';
import Modal from '../components/common/Modal.js';
import CardDetail from '../components/card/CardDetail.js';
import KeyboardShortcutsHelp from '../components/common/KeyboardShortcutsHelp.js';

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { board, lists, labels, members, loading, fetchBoard, clear, moveCard, moveCardLocally, moveListLocally, updateList } = useBoardStore();
  const { user, logout } = useAuthStore();
  useBoardSync(boardId);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'card' | 'list' | null>(null);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Keyboard shortcuts
  useKeyboardShortcuts({ onShowHelp: () => setShowShortcutsHelp(true) });

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
  useEffect(() => {
    if (boardId) {
      const filters: { labels?: string[]; members?: string[] } = {};
      if (activeLabels.length) filters.labels = activeLabels;
      if (activeMembers.length) filters.members = activeMembers;
      fetchBoard(boardId, Object.keys(filters).length ? filters : undefined);
    }
  }, [boardId, fetchBoard, activeLabels.join(','), activeMembers.join(',')]);

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

  const listIds = useMemo(
    () => sortedLists.map((l) => `list-${l.id}`),
    [sortedLists],
  );

  // Find which list contains a given card id (raw id without prefix)
  const findListByCardId = useCallback(
    (cardId: string) => lists.find((l) => l.cards.some((c) => c.id === cardId)),
    [lists],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const idStr = active.id as string;
    if (idStr.startsWith('card-')) {
      setActiveId(idStr.slice(5));
      setActiveType('card');
    } else if (idStr.startsWith('list-')) {
      setActiveId(idStr.slice(5));
      setActiveType('list');
    }
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeIdStr = active.id as string;
      const overIdStr = over.id as string;

      // Only handle card-over-card or card-over-list (cross-container)
      if (!activeIdStr.startsWith('card-')) return;

      const activeCardId = activeIdStr.slice(5);

      // Determine the over list
      let overListId: string | null = null;
      let overCardIndex = -1;

      if (overIdStr.startsWith('list-')) {
        // Dragging over an empty list or list container
        overListId = overIdStr.slice(5);
      } else if (overIdStr.startsWith('card-')) {
        const overCardId = overIdStr.slice(5);
        const overList = findListByCardId(overCardId);
        if (overList) {
          overListId = overList.id;
          const sortedCards = [...overList.cards].sort((a, b) => a.position - b.position);
          overCardIndex = sortedCards.findIndex((c) => c.id === overCardId);
        }
      }

      if (!overListId) return;

      const fromList = findListByCardId(activeCardId);
      if (!fromList) return;

      // If same list, skip - onDragEnd handles final placement
      if (fromList.id === overListId && overIdStr.startsWith('card-')) return;

      // Cross-list move
      if (fromList.id !== overListId) {
        const newIndex = overCardIndex === -1
          ? lists.find((l) => l.id === overListId)?.cards.length ?? 0
          : overCardIndex;
        moveCardLocally(activeCardId, fromList.id, overListId, newIndex);
      }
    },
    [findListByCardId, lists, moveCardLocally],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      setActiveId(null);
      setActiveType(null);

      if (!over) return;

      const activeIdStr = active.id as string;
      const overIdStr = over.id as string;

      // List reorder
      if (activeIdStr.startsWith('list-') && overIdStr.startsWith('list-')) {
        const activeListId = activeIdStr.slice(5);
        const overListId = overIdStr.slice(5);
        if (activeListId === overListId) return;

        const sorted = [...lists].sort((a, b) => a.position - b.position);
        const overIndex = sorted.findIndex((l) => l.id === overListId);
        if (overIndex === -1) return;

        const newPosition = moveListLocally(activeListId, overIndex);
        await updateList(activeListId, { position: newPosition });
        return;
      }

      // Card reorder / move
      if (activeIdStr.startsWith('card-')) {
        const activeCardId = activeIdStr.slice(5);

        let targetListId: string | null = null;
        let overCardIndex = -1;

        if (overIdStr.startsWith('card-')) {
          const overCardId = overIdStr.slice(5);
          const overList = findListByCardId(overCardId);
          if (overList) {
            targetListId = overList.id;
            const sortedCards = [...overList.cards].sort((a, b) => a.position - b.position);
            overCardIndex = sortedCards.findIndex((c) => c.id === overCardId);
          }
        } else if (overIdStr.startsWith('list-')) {
          targetListId = overIdStr.slice(5);
          overCardIndex = lists.find((l) => l.id === targetListId)?.cards.length ?? 0;
        }

        if (!targetListId) return;

        const currentList = findListByCardId(activeCardId);
        if (!currentList) return;

        // Same card dropped on itself - check if position actually changed
        if (currentList.id === targetListId && overIdStr.startsWith('card-')) {
          const sortedCards = [...currentList.cards].sort((a, b) => a.position - b.position);
          const currentIndex = sortedCards.findIndex((c) => c.id === activeCardId);
          if (currentIndex === overCardIndex) return;
        }

        const newIndex = overCardIndex === -1 ? 0 : overCardIndex;
        const newPosition = moveCardLocally(activeCardId, currentList.id, targetListId, newIndex);
        await moveCard(activeCardId, targetListId, newPosition);
      }
    },
    [lists, findListByCardId, moveCardLocally, moveListLocally, moveCard, updateList],
  );

  // Get active card/list data for overlay
  const activeCard = useMemo(() => {
    if (activeType !== 'card' || !activeId) return null;
    for (const list of lists) {
      const card = list.cards.find((c) => c.id === activeId);
      if (card) return card;
    }
    return null;
  }, [activeType, activeId, lists]);

  const activeList = useMemo(() => {
    if (activeType !== 'list' || !activeId) return null;
    return lists.find((l) => l.id === activeId) ?? null;
  }, [activeType, activeId, lists]);

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
          <SearchBar />
          <FontSizeSelector />
          <NotificationBell />
          <span className="text-sm">{user?.displayName}</span>
          <button onClick={handleLogout} className="text-sm hover:underline opacity-80">
            Logout
          </button>
        </div>
      </header>

      {/* Filter bar */}
      {(hasFilters || labels.length > 0 || members.length > 0) && (
        <FilterBar
          labels={labels}
          members={members}
          activeLabels={activeLabels}
          activeMembers={activeMembers}
          onToggleLabel={handleToggleLabel}
          onToggleMember={handleToggleMember}
          onClearFilters={handleClearFilters}
        />
      )}

      <main className="flex-1 overflow-x-auto p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
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
            {activeType === 'card' && activeCard ? (
              <div className="bg-white rounded-lg shadow-lg px-3 py-2 w-[18rem] rotate-2">
                <span className="text-sm text-gray-800">{activeCard.name}</span>
              </div>
            ) : null}
            {activeType === 'list' && activeList ? (
              <div className="bg-gray-200 rounded-xl w-[18rem] px-3 py-2 shadow-lg rotate-2 opacity-90">
                <h3 className="font-semibold text-sm text-gray-800">{activeList.name}</h3>
                <div className="text-sm text-gray-500 mt-1">
                  {activeList.cards.length} card{activeList.cards.length !== 1 ? 's' : ''}
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
