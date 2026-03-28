import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import List from '../components/board/List.js';
import AddList from '../components/board/AddList.js';

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const { board, lists, loading, fetchBoard, clear, moveCard, moveCardLocally, moveListLocally, updateList } = useBoardStore();
  const { user, logout } = useAuthStore();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'card' | 'list' | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  useEffect(() => {
    if (boardId) fetchBoard(boardId);
    return () => clear();
  }, [boardId, fetchBoard, clear]);

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
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/w/${board.workspaceId}`)}
            className="text-sm hover:underline opacity-80"
          >
            &larr; Boards
          </button>
          <h1 className="text-lg font-bold">{board.name}</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm">{user?.displayName}</span>
          <button onClick={handleLogout} className="text-sm hover:underline opacity-80">
            Logout
          </button>
        </div>
      </header>

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
              <div className="bg-white rounded-lg shadow-lg px-3 py-2 w-72 rotate-2">
                <span className="text-sm text-gray-800">{activeCard.name}</span>
              </div>
            ) : null}
            {activeType === 'list' && activeList ? (
              <div className="bg-gray-200 rounded-xl w-72 px-3 py-2 shadow-lg rotate-2 opacity-90">
                <h3 className="font-semibold text-sm text-gray-800">{activeList.name}</h3>
                <div className="text-xs text-gray-500 mt-1">
                  {activeList.cards.length} card{activeList.cards.length !== 1 ? 's' : ''}
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
}
