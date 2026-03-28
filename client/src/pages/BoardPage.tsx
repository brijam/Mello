import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBoardStore } from '../stores/boardStore.js';
import { useAuthStore } from '../stores/authStore.js';
import List from '../components/board/List.js';
import AddList from '../components/board/AddList.js';

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const { board, lists, loading, fetchBoard, clear } = useBoardStore();
  const { user, logout } = useAuthStore();

  useEffect(() => {
    if (boardId) fetchBoard(boardId);
    return () => clear();
  }, [boardId, fetchBoard, clear]);

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
        <div className="flex gap-3 items-start h-full">
          {lists
            .sort((a, b) => a.position - b.position)
            .map((list) => (
              <List key={list.id} list={list} />
            ))}
          <AddList boardId={board.id} />
        </div>
      </main>
    </div>
  );
}
