import { create } from 'zustand';
import type { Board, Label } from '@mello/shared';
import { api } from '../api/client.js';

interface ListWithCards {
  id: string;
  boardId: string;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  cards: CardSummary[];
}

interface CardSummary {
  id: string;
  listId: string;
  boardId: string;
  name: string;
  description: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

interface BoardState {
  board: Board | null;
  lists: ListWithCards[];
  labels: Label[];
  loading: boolean;

  fetchBoard: (boardId: string) => Promise<void>;
  addList: (boardId: string, name: string) => Promise<void>;
  addCard: (listId: string, name: string) => Promise<void>;
  updateList: (listId: string, data: { name?: string; position?: number }) => Promise<void>;
  deleteList: (listId: string) => Promise<void>;
  updateCard: (cardId: string, data: { name?: string; description?: string | null }) => Promise<void>;
  moveCard: (cardId: string, listId: string, position: number) => Promise<void>;
  deleteCard: (cardId: string) => Promise<void>;
  clear: () => void;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  board: null,
  lists: [],
  labels: [],
  loading: false,

  fetchBoard: async (boardId) => {
    set({ loading: true });
    const [boardData, listData] = await Promise.all([
      api.get<{ board: Board; labels: Label[] }>(`/boards/${boardId}`),
      api.get<{ lists: ListWithCards[] }>(`/boards/${boardId}/lists`),
    ]);
    set({
      board: boardData.board,
      labels: boardData.labels,
      lists: listData.lists,
      loading: false,
    });
  },

  addList: async (boardId, name) => {
    const data = await api.post<{ list: ListWithCards }>(`/boards/${boardId}/lists`, { name });
    set((state) => ({ lists: [...state.lists, { ...data.list, cards: [] }] }));
  },

  addCard: async (listId, name) => {
    const data = await api.post<{ card: CardSummary }>(`/lists/${listId}/cards`, { name });
    set((state) => ({
      lists: state.lists.map((list) =>
        list.id === listId ? { ...list, cards: [...list.cards, data.card] } : list,
      ),
    }));
  },

  updateList: async (listId, body) => {
    const data = await api.patch<{ list: ListWithCards }>(`/lists/${listId}`, body);
    set((state) => ({
      lists: state.lists.map((list) =>
        list.id === listId ? { ...list, ...data.list } : list,
      ),
    }));
  },

  deleteList: async (listId) => {
    await api.delete(`/lists/${listId}`);
    set((state) => ({ lists: state.lists.filter((l) => l.id !== listId) }));
  },

  updateCard: async (cardId, body) => {
    await api.patch(`/cards/${cardId}`, body);
    set((state) => ({
      lists: state.lists.map((list) => ({
        ...list,
        cards: list.cards.map((card) =>
          card.id === cardId ? { ...card, ...body } : card,
        ),
      })),
    }));
  },

  moveCard: async (cardId, listId, position) => {
    await api.post(`/cards/${cardId}/move`, { listId, position });
  },

  deleteCard: async (cardId) => {
    await api.delete(`/cards/${cardId}`);
    set((state) => ({
      lists: state.lists.map((list) => ({
        ...list,
        cards: list.cards.filter((c) => c.id !== cardId),
      })),
    }));
  },

  clear: () => set({ board: null, lists: [], labels: [], loading: false }),
}));
