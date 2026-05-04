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
  labelIds: string[];
  memberIds: string[];
  checklistItems: { total: number; checked: number } | null;
  attachmentCount: number;
  commentCount: number;
  isTemplate: boolean;
  coverAttachmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BoardFilterParams {
  labels?: string[];
  members?: string[];
}

interface BoardState {
  board: Board | null;
  lists: ListWithCards[];
  labels: Label[];
  members: { id: string; displayName: string; username: string; avatarUrl: string | null }[];
  loading: boolean;
  activeFilters: BoardFilterParams;

  fetchBoard: (boardId: string, filters?: BoardFilterParams) => Promise<void>;
  addList: (boardId: string, name: string) => Promise<void>;
  addCard: (listId: string, name: string) => Promise<void>;
  updateList: (listId: string, data: { name?: string; position?: number }) => Promise<void>;
  deleteList: (listId: string) => Promise<void>;
  updateCard: (cardId: string, data: { name?: string; description?: string | null }) => Promise<void>;
  moveCard: (cardId: string, listId: string, position: number) => Promise<void>;
  toggleCardLabel: (cardId: string, labelId: string, added: boolean) => void;
  toggleCardMember: (cardId: string, userId: string, added: boolean) => void;
  updateCardChecklist: (cardId: string, checklistItems: { total: number; checked: number } | null) => void;
  updateBoard: (boardId: string, data: { name?: string; backgroundType?: string; backgroundValue?: string }) => Promise<void>;
  deleteCard: (cardId: string) => Promise<void>;
  moveCardLocally: (cardId: string, fromListId: string, toListId: string, newIndex: number) => number;
  moveListLocally: (listId: string, newIndex: number) => number;
  clear: () => void;
}

export function cardMatchesFilters(
  card: { labelIds: string[]; memberIds: string[] },
  filters: BoardFilterParams
): boolean {
  // If label filter active, card must have ALL specified labels
  if (filters.labels?.length) {
    const hasAllLabels = filters.labels.every((id) => card.labelIds.includes(id));
    if (!hasAllLabels) return false;
  }
  // If member filter active, card must have at least ONE specified member
  if (filters.members?.length) {
    const hasAnyMember = filters.members.some((id) => card.memberIds.includes(id));
    if (!hasAnyMember) return false;
  }
  return true;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  board: null,
  lists: [],
  labels: [],
  members: [],
  loading: false,
  activeFilters: {},

  fetchBoard: async (boardId, filters) => {
    const currentBoard = get().board;
    if (!currentBoard || currentBoard.id !== boardId) {
      set({ loading: true });
    }
    let listsUrl = `/boards/${boardId}/lists`;
    const params = new URLSearchParams();
    if (filters?.labels?.length) params.set('labels', filters.labels.join(','));
    if (filters?.members?.length) params.set('members', filters.members.join(','));
    const qs = params.toString();
    if (qs) listsUrl += `?${qs}`;

    set({ activeFilters: filters ?? {} });

    const [boardData, listData, memberData] = await Promise.all([
      api.get<{ board: Board; labels: Label[] }>(`/boards/${boardId}`),
      api.get<{ lists: ListWithCards[] }>(listsUrl),
      api.get<{ members: { user: { id: string; displayName: string; username: string; avatarUrl: string | null }; role: string }[] }>(`/boards/${boardId}/members`),
    ]);
    set({
      board: boardData.board,
      labels: boardData.labels,
      members: memberData.members.map((m) => m.user),
      lists: listData.lists,
      loading: false,
    });
  },

  addList: async (boardId, name) => {
    const data = await api.post<{ list: ListWithCards }>(`/boards/${boardId}/lists`, { name });
    set((state) => {
      if (state.lists.some((l) => l.id === data.list.id)) return state;
      return { lists: [...state.lists, { ...data.list, cards: [] }] };
    });
  },

  addCard: async (listId, name) => {
    const data = await api.post<{ card: CardSummary }>(`/lists/${listId}/cards`, { name });
    const card = { ...data.card, labelIds: data.card.labelIds ?? [], memberIds: data.card.memberIds ?? [] };
    const { activeFilters } = get();
    const hasFilters = (activeFilters.labels?.length ?? 0) > 0 || (activeFilters.members?.length ?? 0) > 0;
    if (hasFilters && !cardMatchesFilters(card, activeFilters)) {
      // Card doesn't match active filters, don't add to UI
      return;
    }
    set((state) => ({
      lists: state.lists.map((list) => {
        if (list.id !== listId) return list;
        if (list.cards.some((c) => c.id === card.id)) return list;
        return { ...list, cards: [...list.cards, card] };
      }),
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

  toggleCardLabel: (cardId, labelId, added) => {
    set((state) => ({
      lists: state.lists.map((list) => ({
        ...list,
        cards: list.cards.map((card) => {
          if (card.id !== cardId) return card;
          const labelIds = added
            ? [...card.labelIds, labelId]
            : card.labelIds.filter((id) => id !== labelId);
          return { ...card, labelIds };
        }),
      })),
    }));
  },

  toggleCardMember: (cardId, userId, added) => {
    set((state) => ({
      lists: state.lists.map((list) => ({
        ...list,
        cards: list.cards.map((card) => {
          if (card.id !== cardId) return card;
          const memberIds = added
            ? [...card.memberIds, userId]
            : card.memberIds.filter((id) => id !== userId);
          return { ...card, memberIds };
        }),
      })),
    }));
  },

  updateCardChecklist: (cardId, checklistItems) => {
    set((state) => ({
      lists: state.lists.map((list) => ({
        ...list,
        cards: list.cards.map((card) =>
          card.id === cardId ? { ...card, checklistItems } : card,
        ),
      })),
    }));
  },

  moveCardLocally: (cardId, fromListId, toListId, newIndex) => {
    const state = get();
    const fromList = state.lists.find((l) => l.id === fromListId);
    const toList = state.lists.find((l) => l.id === toListId);
    if (!fromList || !toList) return 0;

    const card = fromList.cards.find((c) => c.id === cardId);
    if (!card) return 0;

    // Remove from source
    const fromCards = fromList.cards.filter((c) => c.id !== cardId);

    // Sort defensively to ensure position calculations are correct
    const toCards = fromListId === toListId
      ? [...fromCards].sort((a, b) => a.position - b.position)
      : [...toList.cards].sort((a, b) => a.position - b.position);

    // Calculate new position
    let newPosition: number;
    if (toCards.length === 0) {
      newPosition = 65536;
    } else if (newIndex === 0) {
      newPosition = toCards[0].position / 2;
    } else if (newIndex >= toCards.length) {
      newPosition = toCards[toCards.length - 1].position + 65536;
    } else {
      newPosition = (toCards[newIndex - 1].position + toCards[newIndex].position) / 2;
    }

    const movedCard = { ...card, listId: toListId, position: newPosition };

    // Insert into destination
    const newToCards = [...toCards];
    newToCards.splice(newIndex, 0, movedCard);

    set((state) => ({
      lists: state.lists.map((list) => {
        if (list.id === fromListId && fromListId !== toListId) {
          return { ...list, cards: fromCards };
        }
        if (list.id === toListId) {
          return { ...list, cards: newToCards };
        }
        return list;
      }),
    }));

    return newPosition;
  },

  moveListLocally: (listId, newIndex) => {
    const state = get();
    const sorted = [...state.lists].sort((a, b) => a.position - b.position);
    const currentIndex = sorted.findIndex((l) => l.id === listId);
    if (currentIndex === -1) return 0;

    // Remove list and compute new position
    const without = sorted.filter((l) => l.id !== listId);

    let newPosition: number;
    if (without.length === 0) {
      newPosition = 65536;
    } else if (newIndex === 0) {
      newPosition = without[0].position / 2;
    } else if (newIndex >= without.length) {
      newPosition = without[without.length - 1].position + 65536;
    } else {
      newPosition = (without[newIndex - 1].position + without[newIndex].position) / 2;
    }

    set((state) => ({
      lists: state.lists.map((list) =>
        list.id === listId ? { ...list, position: newPosition } : list,
      ),
    }));

    return newPosition;
  },

  updateBoard: async (boardId, data) => {
    const result = await api.patch<{ board: Board }>(`/boards/${boardId}`, data);
    set({ board: result.board });
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

  clear: () => set({ board: null, lists: [], labels: [], members: [], loading: false, activeFilters: {} }),
}));
