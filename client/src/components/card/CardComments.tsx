import { useState, useEffect } from 'react';
import { api } from '../../api/client.js';
import { useAuthStore } from '../../stores/authStore.js';
import { useUnsavedFlag } from '../../stores/unsavedChangesStore.js';
import MarkdownRenderer from './MarkdownRenderer.js';
import MarkdownEditor from './MarkdownEditor.js';
import { timeAgo } from '../../utils/timeAgo.js';

interface CommentUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface Comment {
  id: string;
  cardId: string;
  body: string;
  editedAt: string | null;
  createdAt: string;
  user: CommentUser;
}

interface CardCommentsProps {
  cardId: string;
}

function UserAvatar({ user }: { user: CommentUser }) {
  const initials = (user.displayName || user.username)
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Generate a stable color from the user id
  let hash = 0;
  for (let i = 0; i < user.id.length; i++) {
    hash = user.id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
    'bg-yellow-500', 'bg-red-500', 'bg-indigo-500', 'bg-teal-500',
  ];
  const color = colors[Math.abs(hash) % colors.length];

  return (
    <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center flex-shrink-0 overflow-hidden`}>
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
      ) : (
        <span className="text-white text-sm font-semibold">{initials}</span>
      )}
    </div>
  );
}

export default function CardComments({ cardId }: CardCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBody, setNewBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  const currentUser = useAuthStore((s) => s.user);

  // Flag a non-empty comment draft (new or in-progress edit) as unsaved.
  useUnsavedFlag(
    `comment:${cardId}`,
    newBody.trim() !== '' || (editingId !== null && editBody.trim() !== ''),
  );

  const fetchComments = async () => {
    try {
      const data = await api.get<{ comments: Comment[] }>(`/cards/${cardId}/comments`);
      setComments(data.comments);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [cardId]);

  const handleSubmit = async () => {
    const trimmed = newBody.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/cards/${cardId}/comments`, { body: trimmed });
      setNewBody('');
      await fetchComments();
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (commentId: string) => {
    const trimmed = editBody.trim();
    if (!trimmed) return;
    try {
      await api.patch(`/comments/${commentId}`, { body: trimmed });
      setEditingId(null);
      await fetchComments();
    } catch {
      // ignore
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return;
    try {
      await api.delete(`/comments/${commentId}`);
      await fetchComments();
    } catch {
      // ignore
    }
  };

  return (
    <div>
      {/* New comment */}
      <div className="mb-4">
        <MarkdownEditor
          value={newBody}
          onChange={setNewBody}
          onSave={handleSubmit}
          onCancel={() => setNewBody('')}
          placeholder="Write a comment..."
          minHeight={80}
          submitting={submitting}
          disableEmpty
          hideCancel
          footerExtra={
            <span className="text-sm text-gray-400">
              Tip: @mention other board members to notify them
            </span>
          }
        />
      </div>

      {/* Comments list */}
      {loading ? (
        <p className="text-sm text-gray-400">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-gray-400">No comments yet.</p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => {
            const isAuthor = currentUser?.id === comment.user.id;
            const isEditing = editingId === comment.id;

            return (
              <div key={comment.id} className="flex gap-3">
                <UserAvatar user={comment.user} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-gray-700">
                      {comment.user.displayName || comment.user.username}
                    </span>
                    <span className="text-sm text-gray-400">
                      {timeAgo(comment.createdAt)}
                      {comment.editedAt && ' (edited)'}
                    </span>
                  </div>

                  {isEditing ? (
                    <MarkdownEditor
                      value={editBody}
                      onChange={setEditBody}
                      onSave={() => handleEdit(comment.id)}
                      onCancel={() => setEditingId(null)}
                      minHeight={60}
                      autoFocus
                      disableEmpty
                    />
                  ) : (
                    <>
                      <div className="bg-gray-50 rounded p-2">
                        <MarkdownRenderer content={comment.body} />
                      </div>
                      {isAuthor && (
                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={() => {
                              setEditingId(comment.id);
                              setEditBody(comment.body);
                            }}
                            className="text-sm text-gray-400 hover:text-blue-600 underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(comment.id)}
                            className="text-sm text-gray-400 hover:text-red-600 underline"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
