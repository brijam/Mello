import { create } from 'zustand';
import { api } from '../api/client.js';

interface SearchResult {
  type: string;
  cardId: string;
  cardName: string;
  listId: string;
  listName: string;
  boardId: string;
  boardName: string;
  workspaceId: string;
  snippet: string;
  matchSource: 'name' | 'description' | 'comment';
}

interface SearchState {
  query: string;
  results: SearchResult[];
  loading: boolean;
  isOpen: boolean;
  nextCursor: string | null;
  setQuery: (q: string) => void;
  search: (q: string) => Promise<void>;
  open: () => void;
  close: () => void;
  clear: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  results: [],
  loading: false,
  isOpen: false,
  nextCursor: null,

  setQuery: (query) => set({ query }),

  search: async (q) => {
    if (!q.trim()) {
      set({ results: [], loading: false, nextCursor: null });
      return;
    }
    set({ loading: true });
    try {
      const data = await api.get<{ results: SearchResult[]; nextCursor: string | null }>(
        `/search?q=${encodeURIComponent(q)}`,
      );
      set({ results: data.results, nextCursor: data.nextCursor, loading: false });
    } catch {
      set({ results: [], loading: false, nextCursor: null });
    }
  },

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, query: '', results: [], loading: false, nextCursor: null }),
  clear: () => set({ query: '', results: [], loading: false, nextCursor: null }),
}));
