import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import { api } from '../api/client.js';
import type { Board, Workspace } from '@mello/shared';
import FontSizeSelector from '../components/common/FontSizeSelector.js';

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [newBoardName, setNewBoardName] = useState('');
  const [showCreate, setShowCreate] = useState(false);

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

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-mello-blue-dark text-white px-6 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">Mello</h1>
        <div className="flex items-center gap-4">
          <FontSizeSelector />
          <span className="text-sm">{user?.displayName}</span>
          <button onClick={handleLogout} className="text-sm hover:underline opacity-80">
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">{workspace?.name ?? 'Workspace'}</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {boards.map((board) => (
            <Link
              key={board.id}
              to={`/b/${board.id}`}
              className="rounded-lg p-4 h-24 text-white font-bold shadow hover:opacity-90 transition-opacity"
              style={{ backgroundColor: board.backgroundType === 'color' ? board.backgroundValue : '#0079bf' }}
            >
              {board.name}
            </Link>
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
      </main>
    </div>
  );
}
