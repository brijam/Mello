import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import { api } from '../api/client.js';
import type { User } from '@mello/shared';

interface CreateForm {
  email: string;
  username: string;
  displayName: string;
  password: string;
  isAdmin: boolean;
}

type BoardRole = 'admin' | 'normal' | 'observer';

interface BoardPermRow {
  boardId: string;
  boardName: string;
  workspaceId: string;
  workspaceName: string;
  role: BoardRole | null;
}

const ROLE_LABEL: Record<BoardRole, string> = {
  observer: 'View',
  normal: 'Edit',
  admin: 'Delete',
};

const emptyCreate: CreateForm = {
  email: '',
  username: '',
  displayName: '',
  password: '',
  isAdmin: false,
};

export default function AdminUsersPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ email: string; username: string; displayName: string; isAdmin: boolean } | null>(null);
  const [resetForId, setResetForId] = useState<string | null>(null);
  const [resetPwd, setResetPwd] = useState('');
  const [boardsForId, setBoardsForId] = useState<string | null>(null);
  const [boardsList, setBoardsList] = useState<BoardPermRow[] | null>(null);
  const [boardsLoading, setBoardsLoading] = useState(false);

  const refresh = async () => {
    try {
      const data = await api.get<{ users: User[] }>('/admin/users');
      setUsers(data.users);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !user.isAdmin) {
      navigate('/', { replace: true });
      return;
    }
    if (user) refresh();
  }, [user, navigate]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/admin/users', createForm);
      setCreateForm(emptyCreate);
      setShowCreate(false);
      await refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to create user');
    }
  };

  const startEdit = (u: User) => {
    setEditingId(u.id);
    setEditForm({ email: u.email, username: u.username, displayName: u.displayName, isAdmin: u.isAdmin });
  };

  const handleSaveEdit = async (id: string) => {
    if (!editForm) return;
    setError(null);
    try {
      await api.patch(`/admin/users/${id}`, editForm);
      setEditingId(null);
      setEditForm(null);
      await refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to update user');
    }
  };

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    setError(null);
    try {
      await api.delete(`/admin/users/${id}`);
      await refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to delete user');
    }
  };

  const openBoards = async (id: string) => {
    setBoardsForId(id);
    setBoardsList(null);
    setBoardsLoading(true);
    setError(null);
    try {
      const data = await api.get<{ boards: BoardPermRow[] }>(`/admin/users/${id}/boards`);
      setBoardsList(data.boards);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load boards');
    } finally {
      setBoardsLoading(false);
    }
  };

  const setBoardRole = async (boardId: string, role: BoardRole | null) => {
    if (!boardsForId) return;
    setError(null);
    try {
      if (role === null) {
        await api.delete(`/admin/users/${boardsForId}/boards/${boardId}`);
      } else {
        await api.put(`/admin/users/${boardsForId}/boards/${boardId}`, { role });
      }
      setBoardsList((prev) =>
        prev ? prev.map((b) => (b.boardId === boardId ? { ...b, role } : b)) : prev,
      );
    } catch (e: any) {
      setError(e.message ?? 'Failed to update board permission');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetForId) return;
    setError(null);
    try {
      await api.post(`/admin/users/${resetForId}/reset-password`, { password: resetPwd });
      setResetForId(null);
      setResetPwd('');
    } catch (e: any) {
      setError(e.message ?? 'Failed to reset password');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-500">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-mello-blue-dark text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-sm hover:underline opacity-80">
            &larr; Back
          </button>
          <h1 className="text-xl font-bold">User Management</h1>
        </div>
        <span className="text-sm">{user?.displayName}</span>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Users ({users.length})</h2>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="bg-mello-blue text-white text-sm px-4 py-2 rounded hover:opacity-90"
          >
            {showCreate ? 'Cancel' : '+ New User'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="bg-white p-4 rounded shadow mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              required
              type="email"
              placeholder="Email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <input
              required
              placeholder="Username"
              value={createForm.username}
              onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <input
              required
              placeholder="Display Name"
              value={createForm.displayName}
              onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <input
              required
              type="password"
              placeholder="Password (min 8 chars)"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={createForm.isAdmin}
                onChange={(e) => setCreateForm({ ...createForm, isAdmin: e.target.checked })}
              />
              Superuser (admin)
            </label>
            <div className="md:col-span-2">
              <button type="submit" className="bg-mello-blue text-white text-sm px-4 py-2 rounded">
                Create User
              </button>
            </div>
          </form>
        )}

        <div className="bg-white rounded shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Username</th>
                <th className="px-4 py-2">Display Name</th>
                <th className="px-4 py-2">Admin</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isEditing = editingId === u.id;
                return (
                  <tr key={u.id} className="border-t border-gray-100">
                    {isEditing && editForm ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                            className="border border-gray-300 rounded px-2 py-1 w-full"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            value={editForm.username}
                            onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                            className="border border-gray-300 rounded px-2 py-1 w-full"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            value={editForm.displayName}
                            onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                            className="border border-gray-300 rounded px-2 py-1 w-full"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={editForm.isAdmin}
                            onChange={(e) => setEditForm({ ...editForm, isAdmin: e.target.checked })}
                            disabled={u.id === user?.id}
                          />
                        </td>
                        <td className="px-4 py-2 text-gray-500">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleSaveEdit(u.id)}
                            className="text-mello-blue hover:underline mr-3"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setEditForm(null); }}
                            className="text-gray-500 hover:underline"
                          >
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2">{u.email}</td>
                        <td className="px-4 py-2">{u.username}</td>
                        <td className="px-4 py-2">{u.displayName}</td>
                        <td className="px-4 py-2">{u.isAdmin ? 'Yes' : 'No'}</td>
                        <td className="px-4 py-2 text-gray-500">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <button onClick={() => startEdit(u)} className="text-mello-blue hover:underline mr-3">
                            Edit
                          </button>
                          <button
                            onClick={() => openBoards(u.id)}
                            className="text-mello-blue hover:underline mr-3"
                          >
                            Boards
                          </button>
                          <button
                            onClick={() => { setResetForId(u.id); setResetPwd(''); }}
                            className="text-mello-blue hover:underline mr-3"
                          >
                            Reset PW
                          </button>
                          <button
                            onClick={() => handleDelete(u.id, u.email)}
                            disabled={u.id === user?.id}
                            className="text-red-600 hover:underline disabled:text-gray-300 disabled:no-underline"
                          >
                            Delete
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      {boardsForId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold">Board Permissions</h3>
                <p className="text-sm text-gray-600">
                  {users.find((u) => u.id === boardsForId)?.email}
                </p>
              </div>
              <button
                onClick={() => { setBoardsForId(null); setBoardsList(null); }}
                className="text-sm text-gray-500 hover:underline"
              >
                Close
              </button>
            </div>
            <div className="overflow-auto flex-1 border border-gray-200 rounded">
              {boardsLoading && (
                <div className="p-4 text-sm text-gray-500">Loading boards...</div>
              )}
              {!boardsLoading && boardsList && boardsList.length === 0 && (
                <div className="p-4 text-sm text-gray-500">No boards exist.</div>
              )}
              {!boardsLoading && boardsList && boardsList.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-left sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Workspace</th>
                      <th className="px-3 py-2">Board</th>
                      <th className="px-3 py-2">Permission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boardsList.map((b) => (
                      <tr key={b.boardId} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-600">{b.workspaceName}</td>
                        <td className="px-3 py-2">{b.boardName}</td>
                        <td className="px-3 py-2">
                          <select
                            value={b.role ?? ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              setBoardRole(b.boardId, v === '' ? null : (v as BoardRole));
                            }}
                            className="border border-gray-300 rounded px-2 py-1"
                          >
                            <option value="">None</option>
                            <option value="observer">{ROLE_LABEL.observer}</option>
                            <option value="normal">{ROLE_LABEL.normal}</option>
                            <option value="admin">{ROLE_LABEL.admin}</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              View = read-only · Edit = modify cards/lists · Delete = full board admin
            </p>
          </div>
        </div>
      )}

      {resetForId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form onSubmit={handleResetPassword} className="bg-white rounded p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-3">Reset Password</h3>
            <p className="text-sm text-gray-600 mb-3">
              Set a new password for {users.find((u) => u.id === resetForId)?.email}.
            </p>
            <input
              required
              type="password"
              minLength={8}
              autoFocus
              placeholder="New password (min 8 chars)"
              value={resetPwd}
              onChange={(e) => setResetPwd(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 w-full mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setResetForId(null); setResetPwd(''); }}
                className="text-sm px-4 py-2 text-gray-600"
              >
                Cancel
              </button>
              <button type="submit" className="bg-mello-blue text-white text-sm px-4 py-2 rounded">
                Reset
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
