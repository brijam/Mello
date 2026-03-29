import { create } from 'zustand';
import type { User } from '@mello/shared';
import { api } from '../api/client.js';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  updateAvatar: (file: File) => Promise<void>;
  removeAvatar: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  login: async (email, password) => {
    const data = await api.post<{ user: User }>('/auth/login', { email, password });
    set({ user: data.user });
  },

  register: async (email, username, password, displayName) => {
    const data = await api.post<{ user: User }>('/auth/register', { email, username, password, displayName });
    set({ user: data.user });
  },

  logout: async () => {
    await api.post('/auth/logout');
    set({ user: null });
  },

  fetchMe: async () => {
    try {
      const data = await api.get<{ user: User }>('/auth/me');
      set({ user: data.user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  updateAvatar: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/v1/auth/me/avatar', {
      method: 'PATCH',
      credentials: 'include',
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error?.message ?? 'Failed to upload avatar');
    }
    const data = await res.json();
    set({ user: data.user });
  },

  removeAvatar: async () => {
    const data = await api.delete<{ user: User }>('/auth/me/avatar');
    set({ user: data.user });
  },
}));
