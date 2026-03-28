import { create } from 'zustand';
import { api } from '../api/client.js';

interface NotificationData {
  cardId?: string;
  cardName?: string;
  boardId?: string;
  boardName?: string;
  actorId: string;
  actorDisplayName: string;
  commentId?: string;
  commentSnippet?: string;
}

export interface Notification {
  id: string;
  type: 'mention' | 'card_assigned' | 'board_added';
  data: NotificationData;
  read: boolean;
  createdAt: string;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  nextCursor: string | null;
  hasMore: boolean;

  fetchNotifications: (reset?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  prependNotification: (n: Notification) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  nextCursor: null,
  hasMore: true,

  fetchNotifications: async (reset = true) => {
    set({ loading: true });
    try {
      const data = await api.get<{
        notifications: Notification[];
        nextCursor: string | null;
        unreadCount: number;
      }>('/notifications?limit=20');
      set({
        notifications: reset ? data.notifications : [...get().notifications, ...data.notifications],
        unreadCount: data.unreadCount,
        nextCursor: data.nextCursor,
        hasMore: data.nextCursor !== null,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  loadMore: async () => {
    const { nextCursor, loading } = get();
    if (loading || !nextCursor) return;
    set({ loading: true });
    try {
      const data = await api.get<{
        notifications: Notification[];
        nextCursor: string | null;
        unreadCount: number;
      }>(`/notifications?limit=20&cursor=${encodeURIComponent(nextCursor)}`);
      set((state) => ({
        notifications: [...state.notifications, ...data.notifications],
        unreadCount: data.unreadCount,
        nextCursor: data.nextCursor,
        hasMore: data.nextCursor !== null,
        loading: false,
      }));
    } catch {
      set({ loading: false });
    }
  },

  markRead: async (ids) => {
    try {
      await api.post('/notifications/mark-read', { ids });
      set((state) => ({
        notifications: state.notifications.map((n) =>
          ids.includes(n.id) ? { ...n, read: true } : n,
        ),
        unreadCount: Math.max(0, state.unreadCount - ids.filter((id) =>
          state.notifications.find((n) => n.id === id && !n.read),
        ).length),
      }));
    } catch {
      // ignore
    }
  },

  markAllRead: async () => {
    try {
      await api.post('/notifications/mark-all-read');
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch {
      // ignore
    }
  },

  prependNotification: (n) => {
    set((state) => ({
      notifications: [n, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },
}));
