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
}));
