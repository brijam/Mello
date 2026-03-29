import { useEffect } from 'react';
import { WS_EVENTS } from '@mello/shared';
import { useSocket } from './useSocket.js';
import { useBoardStore, cardMatchesFilters } from '../stores/boardStore.js';

export function useBoardSync(boardId: string | undefined) {
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (!boardId || !isConnected) return;

    socket.emit(WS_EVENTS.JOIN_BOARD, boardId);

    // List events
    socket.on(WS_EVENTS.LIST_CREATED, (data: { list: any }) => {
      useBoardStore.setState((state) => {
        // Avoid duplicates (optimistic update may have already added it)
        if (state.lists.some((l) => l.id === data.list.id)) return state;
        return { lists: [...state.lists, data.list] };
      });
    });

    socket.on(WS_EVENTS.LIST_UPDATED, (data: { list: any }) => {
      useBoardStore.setState((state) => ({
        lists: state.lists.map((l) =>
          l.id === data.list.id ? { ...l, ...data.list, cards: l.cards } : l,
        ),
      }));
    });

    socket.on(WS_EVENTS.LIST_DELETED, (data: { listId: string }) => {
      useBoardStore.setState((state) => ({
        lists: state.lists.filter((l) => l.id !== data.listId),
      }));
    });

    // Card events
    socket.on(WS_EVENTS.CARD_CREATED, (data: { card: any }) => {
      useBoardStore.setState((state) => {
        const card = { ...data.card, labelIds: data.card.labelIds ?? [], memberIds: data.card.memberIds ?? [] };
        // Check filters
        const hasFilters = (state.activeFilters.labels?.length ?? 0) > 0 || (state.activeFilters.members?.length ?? 0) > 0;
        if (hasFilters && !cardMatchesFilters(card, state.activeFilters)) return state;
        // Avoid duplicates
        const targetList = state.lists.find((l) => l.id === card.listId);
        if (targetList?.cards.some((c) => c.id === card.id)) return state;
        return {
          lists: state.lists.map((l) =>
            l.id === card.listId ? { ...l, cards: [...l.cards, card] } : l,
          ),
        };
      });
    });

    socket.on(WS_EVENTS.CARD_UPDATED, (data: { card: any; labelId?: string; labelAction?: 'added' | 'removed' }) => {
      useBoardStore.setState((state) => {
        const hasFilters = (state.activeFilters.labels?.length ?? 0) > 0 || (state.activeFilters.members?.length ?? 0) > 0;

        return {
          lists: state.lists.map((list) => ({
            ...list,
            cards: list.cards.map((card) => {
              if (card.id !== data.card.id) return card;
              let labelIds = card.labelIds;
              if (data.labelId && data.labelAction === 'added') {
                if (!labelIds.includes(data.labelId)) {
                  labelIds = [...labelIds, data.labelId];
                }
              } else if (data.labelId && data.labelAction === 'removed') {
                labelIds = labelIds.filter((id) => id !== data.labelId);
              }
              return { ...card, ...data.card, labelIds, memberIds: data.card.memberIds ?? card.memberIds ?? [] };
            }).filter((card) => {
              if (!hasFilters) return true;
              return cardMatchesFilters(card, state.activeFilters);
            }),
          })),
        };
      });
    });

    socket.on(WS_EVENTS.CARD_MOVED, (data: { card: any }) => {
      const movedCard = data.card;
      useBoardStore.setState((state) => {
        const hasFilters = (state.activeFilters.labels?.length ?? 0) > 0 || (state.activeFilters.members?.length ?? 0) > 0;

        // Remove from all lists
        const listsWithout = state.lists.map((l) => ({
          ...l,
          cards: l.cards.filter((c) => c.id !== movedCard.id),
        }));

        // Find existing card to preserve labelIds/memberIds
        const existingCard = state.lists
          .flatMap((ll) => ll.cards)
          .find((c) => c.id === movedCard.id);
        const card = {
          ...movedCard,
          labelIds: existingCard?.labelIds ?? [],
          memberIds: existingCard?.memberIds ?? [],
        };

        // Check filters before re-adding
        if (hasFilters && !cardMatchesFilters(card, state.activeFilters)) {
          return { lists: listsWithout };
        }

        return {
          lists: listsWithout.map((l) => {
            if (l.id !== movedCard.listId) return l;
            return { ...l, cards: [...l.cards, card] };
          }),
        };
      });
    });

    socket.on(WS_EVENTS.CARD_DELETED, (data: { cardId: string; listId: string }) => {
      useBoardStore.setState((state) => ({
        lists: state.lists.map((l) => ({
          ...l,
          cards: l.cards.filter((c) => c.id !== data.cardId),
        })),
      }));
    });

    // Label events
    socket.on(WS_EVENTS.LABEL_CREATED, (data: { label: any }) => {
      useBoardStore.setState((state) => {
        if (state.labels.some((l) => l.id === data.label.id)) return state;
        return { labels: [...state.labels, data.label] };
      });
    });

    socket.on(WS_EVENTS.LABEL_UPDATED, (data: { label: any }) => {
      useBoardStore.setState((state) => ({
        labels: state.labels.map((l) =>
          l.id === data.label.id ? { ...l, ...data.label } : l,
        ),
      }));
    });

    socket.on(WS_EVENTS.LABEL_DELETED, (data: { labelId: string }) => {
      useBoardStore.setState((state) => ({
        labels: state.labels.filter((l) => l.id !== data.labelId),
      }));
    });

    return () => {
      socket.emit(WS_EVENTS.LEAVE_BOARD, boardId);
      socket.off(WS_EVENTS.LIST_CREATED);
      socket.off(WS_EVENTS.LIST_UPDATED);
      socket.off(WS_EVENTS.LIST_DELETED);
      socket.off(WS_EVENTS.CARD_CREATED);
      socket.off(WS_EVENTS.CARD_UPDATED);
      socket.off(WS_EVENTS.CARD_MOVED);
      socket.off(WS_EVENTS.CARD_DELETED);
      socket.off(WS_EVENTS.LABEL_CREATED);
      socket.off(WS_EVENTS.LABEL_UPDATED);
      socket.off(WS_EVENTS.LABEL_DELETED);
    };
  }, [boardId, isConnected, socket]);
}
