import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import { api } from '../api/client.js';
import type { Board, Workspace } from '@mello/shared';
import FontSizeSelector from '../components/common/FontSizeSelector.js';
import DarkModeToggle from '../components/common/DarkModeToggle.js';
import SearchBar from '../components/search/SearchBar.js';
import NotificationBell from '../components/notifications/NotificationBell.js';
import KeyboardShortcutsHelp from '../components/common/KeyboardShortcutsHelp.js';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableBoardCard({ board }: { board: Board }) {
  const navigate = useNavigate();
  const wasDragged = useRef(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: board.id });

  useEffect(() => {
    if (isDragging) {
      wasDragged.current = true;
    }
  }, [isDragging]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    backgroundColor: board.backgroundType === 'color' ? board.backgroundValue : '#0079bf',
  };

  return (
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
        navigate(`/b/${board.id}`);
      }}
      className="rounded-lg p-4 h-24 text-white font-bold shadow hover:opacity-90 transition-opacity cursor-pointer"
    >
      {board.name}
    </div>
  );
}

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [newBoardName, setNewBoardName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  useKeyboardShortcuts({ onShowHelp: () => setShowShortcutsHelp(true) });

  useEffect(() => {
    if (!workspaceId) return;
    Promise.all([
      api.get<{ workspace: Workspace }>(`/workspaces/${workspaceId}`),
      api.get<{ boards: Board[] }>(`/workspaces/${workspaceId}/boards`),
    ]).then(([wsData, boardData]) => {
      setWorkspace(wsData.workspace);
      setBoards(boardData.boards);
    });
  }, [workspaceId]);

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim() || !workspaceId) return;
    const data = await api.post<{ board: Board }>('/boards', {
      workspaceId,
      name: newBoardName.trim(),
    });
    setBoards([...boards, data.board]);
    setNewBoardName('');
    setShowCreate(false);
  };

  const sortedBoards = [...boards].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const handleDragStart = (event: DragStartEvent) => {
    const board = boards.find((b) => b.id === event.active.id);
    setActiveBoard(board ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveBoard(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedBoards.findIndex((b) => b.id === active.id);
    const newIndex = sortedBoards.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Remove active board and compute position from remaining boards
    const without = sortedBoards.filter((b) => b.id !== active.id);

    let newPosition: number;
    if (without.length === 0) {
      newPosition = 65536;
    } else if (newIndex === 0) {
      newPosition = without[0].position / 2;
      // Handle case where first board has position 0
      if (newPosition === 0) newPosition = without[0].position > 0 ? without[0].position / 2 : 0.5;
    } else if (newIndex >= without.length) {
      newPosition = without[without.length - 1].position + 65536;
    } else {
      const before = without[newIndex - 1].position;
      const after = without[newIndex].position;
      newPosition = (before + after) / 2;
      // Handle case where before and after are the same (both 0)
      if (newPosition === before) newPosition = before + 0.5;
    }

    // Update locally
    setBoards(sortedBoards.map((b) =>
      b.id === active.id ? { ...b, position: newPosition } : b
    ));

    try {
      await api.patch(`/boards/${active.id}`, { position: newPosition });
    } catch {
      if (workspaceId) {
        const boardData = await api.get<{ boards: Board[] }>(`/workspaces/${workspaceId}/boards`);
        setBoards(boardData.boards);
      }
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-mello-blue-dark text-white px-6 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">Mello</h1>
        <div className="flex items-center gap-3">
          <SearchBar />
          <FontSizeSelector />
          <DarkModeToggle />
          <NotificationBell />
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

      <main className="max-w-5xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">{workspace?.name ?? 'Workspace'}</h2>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortedBoards.map((b) => b.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {sortedBoards.map((board) => (
                <SortableBoardCard key={board.id} board={board} />
              ))}

              {showCreate ? (
                <form onSubmit={handleCreateBoard} className="rounded-lg bg-gray-200 p-3">
                  <input
                    autoFocus
                    value={newBoardName}
                    onChange={(e) => setNewBoardName(e.target.value)}
                    placeholder="Board name"
                    className="w-full border border-gray-300 rounded px-2 py-1 mb-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="bg-mello-blue text-white text-sm px-3 py-1 rounded">
                      Create
                    </button>
                    <button type="button" onClick={() => setShowCreate(false)} className="text-sm text-gray-500">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setShowCreate(true)}
                  className="rounded-lg bg-gray-200 hover:bg-gray-300 p-4 h-24 text-gray-600 text-sm transition-colors"
                >
                  + Create new board
                </button>
              )}
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {activeBoard && (
              <div
                className="rounded-lg p-4 h-24 text-white font-bold shadow-lg rotate-2 opacity-90"
                style={{ backgroundColor: activeBoard.backgroundType === 'color' ? activeBoard.backgroundValue : '#0079bf' }}
              >
                {activeBoard.name}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </main>

      <KeyboardShortcutsHelp isOpen={showShortcutsHelp} onClose={() => setShowShortcutsHelp(false)} />
    </div>
  );
}
