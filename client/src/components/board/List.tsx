import { useState, useMemo, useCallback, memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBoardStore } from '../../stores/boardStore.js';
import Card from './Card.js';
import AddCard from './AddCard.js';
import TemplateCard from './TemplateCard.js';
import MoveListDialog from './MoveListDialog.js';
import MoveAllCardsDialog from './MoveAllCardsDialog.js';

interface ListProps {
  list: {
    id: string;
    name: string;
    cards: Array<{
      id: string;
      name: string;
      description: string | null;
      position: number;
    }>;
  };
}

export default memo(function List({ list }: ListProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(list.name);
  const [showListMenu, setShowListMenu] = useState(false);
  const [showMoveList, setShowMoveList] = useState(false);
  const [showMoveCards, setShowMoveCards] = useState(false);
  const updateList = useBoardStore((s) => s.updateList);
  const deleteList = useBoardStore((s) => s.deleteList);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `list-${list.id}`,
    data: {
      type: 'list',
      list,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleRename = async () => {
    if (name.trim() && name !== list.name) {
      await updateList(list.id, { name: name.trim() });
    }
    setIsEditing(false);
  };

  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const sortedCards = useMemo(
    () => [...list.cards].sort((a, b) => a.position - b.position),
    [list.cards],
  );
  // Get all template cards across the entire board (lazy — only when picker is open)
  const allLists = useBoardStore(
    useCallback((s: any) => showTemplatePicker ? s.lists : null, [showTemplatePicker])
  );
  const boardTemplateCards = useMemo(
    () => allLists ? allLists.flatMap((l: any) => l.cards).filter((c: any) => c.isTemplate) : [],
    [allLists],
  );

  return (
    <>
    <div
      ref={setNodeRef}
      style={style}
      className="bg-gray-200 rounded-xl w-[27rem] flex-shrink-0 flex flex-col max-h-[calc(100vh-120px)]"
    >
      <div
        {...attributes}
        {...listeners}
        className="px-3 py-2 flex items-center justify-between cursor-grab"
        style={{ touchAction: 'none' }}
      >
        {isEditing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            onPointerDown={(e) => e.stopPropagation()}
            className="font-semibold text-sm bg-white border border-blue-400 rounded px-1 py-0.5 w-full"
          />
        ) : (
          <h3
            onClick={() => setIsEditing(true)}
            className="font-semibold text-sm text-gray-800 cursor-pointer px-1"
          >
            {list.name}
          </h3>
        )}
        <div className="relative">
          <button
            onClick={() => setShowListMenu((v) => !v)}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-gray-400 hover:text-gray-600 text-sm ml-2 p-1 rounded hover:bg-gray-300/50"
            title="List actions"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 10a2 2 0 114 0 2 2 0 01-4 0z" />
            </svg>
          </button>
          {showListMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowListMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[200px]">
                <button
                  onClick={() => { setShowListMenu(false); setShowMoveList(true); }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                  Move List
                </button>
                <button
                  onClick={() => { setShowListMenu(false); setShowMoveCards(true); }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  Move All Cards
                </button>
                <hr className="my-1 border-gray-200" />
                <button
                  onClick={() => {
                    setShowListMenu(false);
                    if (confirm(`Delete list "${list.name}" and all its cards? This cannot be undone.`)) {
                      deleteList(list.id);
                    }
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete List
                </button>
              </div>
            </>
          )}
        </div>
      </div>

        <div data-list-id={list.id} className="flex-1 overflow-y-auto px-2 pb-1 space-y-1.5 min-h-[2rem]">
          {sortedCards.map((card) => (
            <Card key={card.id} card={card} listId={list.id} />
          ))}
        </div>

      <div className="px-2 pb-2">
        <div className="flex items-center gap-1">
          <div className="flex-1">
            <AddCard listId={list.id} />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowTemplatePicker((v) => !v)}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded hover:bg-gray-300/50 transition-colors"
              title="Create from template"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
              </svg>
            </button>
            {showTemplatePicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowTemplatePicker(false)} />
                <div className="absolute bottom-full right-0 mb-1 w-[20rem] bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">Create from template</p>
                  {boardTemplateCards.length > 0 ? (
                    boardTemplateCards.map((card: any) => (
                      <div key={card.id} className="mb-1">
                        <TemplateCard
                          card={card}
                          listId={list.id}
                          onCreated={() => setShowTemplatePicker(false)}
                        />
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-400 px-1 py-2">No templates yet. Open a card and use the menu to mark it as a template.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
    {showMoveList && (
      <MoveListDialog
        listId={list.id}
        listName={list.name}
        currentBoardId={useBoardStore.getState().board?.id ?? ''}
        onClose={() => setShowMoveList(false)}
        onMoved={() => {
          setShowMoveList(false);
          const boardId = useBoardStore.getState().board?.id;
          if (boardId) useBoardStore.getState().fetchBoard(boardId);
        }}
      />
    )}
    {showMoveCards && (
      <MoveAllCardsDialog
        listId={list.id}
        listName={list.name}
        currentBoardId={useBoardStore.getState().board?.id ?? ''}
        onClose={() => setShowMoveCards(false)}
        onMoved={() => {
          setShowMoveCards(false);
          const boardId = useBoardStore.getState().board?.id;
          if (boardId) useBoardStore.getState().fetchBoard(boardId);
        }}
      />
    )}
    </>
  );
});
