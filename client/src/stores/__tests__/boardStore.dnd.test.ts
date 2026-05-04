import { describe, it, expect, beforeEach } from 'vitest';
import { useBoardStore } from '../boardStore.js';

/**
 * Helper to create a minimal card object for state setup.
 */
function makeCard(overrides: {
  id: string;
  listId: string;
  position: number;
  name?: string;
}) {
  return {
    id: overrides.id,
    listId: overrides.listId,
    boardId: 'board-1',
    name: overrides.name ?? overrides.id,
    description: null,
    position: overrides.position,
    labelIds: [],
    memberIds: [],
    checklistItems: null,
    attachmentCount: 0,
    commentCount: 0,
    isTemplate: false,
    coverAttachmentId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

/**
 * Helper to create a minimal list object for state setup.
 */
function makeList(overrides: {
  id: string;
  position: number;
  name?: string;
  cards?: ReturnType<typeof makeCard>[];
}) {
  return {
    id: overrides.id,
    boardId: 'board-1',
    name: overrides.name ?? overrides.id,
    position: overrides.position,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    cards: overrides.cards ?? [],
  };
}

describe('boardStore drag-and-drop', () => {
  beforeEach(() => {
    useBoardStore.setState({
      board: null,
      lists: [],
      labels: [],
      members: [],
      loading: false,
      activeFilters: {},
    });
  });

  describe('moveCardLocally', () => {
    it('moves a card within the same list from first to last', () => {
      const cards = [
        makeCard({ id: 'c1', listId: 'list-1', position: 10000 }),
        makeCard({ id: 'c2', listId: 'list-1', position: 20000 }),
        makeCard({ id: 'c3', listId: 'list-1', position: 30000 }),
      ];
      useBoardStore.setState({
        lists: [makeList({ id: 'list-1', position: 65536, cards })],
      });

      // Move c1 (index 0) to after c3 (newIndex 2, since c1 is removed first leaving [c2, c3])
      const pos = useBoardStore.getState().moveCardLocally('c1', 'list-1', 'list-1', 2);

      // newIndex >= toCards.length (2 >= 2), so position = last.position + 65536 = 30000 + 65536
      expect(pos).toBe(30000 + 65536);

      const list = useBoardStore.getState().lists.find((l) => l.id === 'list-1')!;
      const movedCard = list.cards.find((c) => c.id === 'c1')!;
      expect(movedCard.position).toBe(pos);
    });

    it('moves a card within the same list from last to first', () => {
      const cards = [
        makeCard({ id: 'c1', listId: 'list-1', position: 10000 }),
        makeCard({ id: 'c2', listId: 'list-1', position: 20000 }),
        makeCard({ id: 'c3', listId: 'list-1', position: 30000 }),
      ];
      useBoardStore.setState({
        lists: [makeList({ id: 'list-1', position: 65536, cards })],
      });

      // Move c3 to index 0 (remaining sorted cards after removing c3: [c1, c2])
      const pos = useBoardStore.getState().moveCardLocally('c3', 'list-1', 'list-1', 0);

      // newIndex === 0, so position = toCards[0].position / 2 = 10000 / 2
      expect(pos).toBe(10000 / 2);

      const list = useBoardStore.getState().lists.find((l) => l.id === 'list-1')!;
      const movedCard = list.cards.find((c) => c.id === 'c3')!;
      expect(movedCard.position).toBe(pos);
    });

    it('moves a card within the same list to a middle position', () => {
      const cards = [
        makeCard({ id: 'c1', listId: 'list-1', position: 10000 }),
        makeCard({ id: 'c2', listId: 'list-1', position: 20000 }),
        makeCard({ id: 'c3', listId: 'list-1', position: 30000 }),
        makeCard({ id: 'c4', listId: 'list-1', position: 40000 }),
      ];
      useBoardStore.setState({
        lists: [makeList({ id: 'list-1', position: 65536, cards })],
      });

      // Move c1 to index 2 (remaining after removing c1: [c2(20000), c3(30000), c4(40000)])
      // newIndex=2 -> between toCards[1] and toCards[2] -> (30000 + 40000) / 2
      const pos = useBoardStore.getState().moveCardLocally('c1', 'list-1', 'list-1', 2);

      expect(pos).toBe((30000 + 40000) / 2);

      const list = useBoardStore.getState().lists.find((l) => l.id === 'list-1')!;
      const movedCard = list.cards.find((c) => c.id === 'c1')!;
      expect(movedCard.position).toBe(pos);
    });

    it('moves a card to a different empty list', () => {
      useBoardStore.setState({
        lists: [
          makeList({
            id: 'list-1',
            position: 65536,
            cards: [makeCard({ id: 'c1', listId: 'list-1', position: 10000 })],
          }),
          makeList({ id: 'list-2', position: 131072, cards: [] }),
        ],
      });

      const pos = useBoardStore.getState().moveCardLocally('c1', 'list-1', 'list-2', 0);

      // Empty destination list -> position = 65536
      expect(pos).toBe(65536);

      const list2 = useBoardStore.getState().lists.find((l) => l.id === 'list-2')!;
      const movedCard = list2.cards.find((c) => c.id === 'c1')!;
      expect(movedCard.position).toBe(pos);
      expect(movedCard.listId).toBe('list-2');
    });

    it('moves a card to a different non-empty list at the beginning', () => {
      useBoardStore.setState({
        lists: [
          makeList({
            id: 'list-1',
            position: 65536,
            cards: [makeCard({ id: 'c1', listId: 'list-1', position: 10000 })],
          }),
          makeList({
            id: 'list-2',
            position: 131072,
            cards: [
              makeCard({ id: 'c2', listId: 'list-2', position: 20000 }),
              makeCard({ id: 'c3', listId: 'list-2', position: 40000 }),
            ],
          }),
        ],
      });

      const pos = useBoardStore.getState().moveCardLocally('c1', 'list-1', 'list-2', 0);

      // newIndex === 0, so position = toCards[0].position / 2 = 20000 / 2
      expect(pos).toBe(20000 / 2);
      expect(pos).toBeLessThan(20000);

      const list2 = useBoardStore.getState().lists.find((l) => l.id === 'list-2')!;
      const movedCard = list2.cards.find((c) => c.id === 'c1')!;
      expect(movedCard.position).toBe(pos);
    });

    it('moves a card to a different non-empty list at the end', () => {
      useBoardStore.setState({
        lists: [
          makeList({
            id: 'list-1',
            position: 65536,
            cards: [makeCard({ id: 'c1', listId: 'list-1', position: 10000 })],
          }),
          makeList({
            id: 'list-2',
            position: 131072,
            cards: [
              makeCard({ id: 'c2', listId: 'list-2', position: 20000 }),
              makeCard({ id: 'c3', listId: 'list-2', position: 40000 }),
            ],
          }),
        ],
      });

      const pos = useBoardStore.getState().moveCardLocally('c1', 'list-1', 'list-2', 2);

      // newIndex (2) >= toCards.length (2), so position = last.position + 65536 = 40000 + 65536
      expect(pos).toBe(40000 + 65536);
      expect(pos).toBeGreaterThan(40000);

      const list2 = useBoardStore.getState().lists.find((l) => l.id === 'list-2')!;
      const movedCard = list2.cards.find((c) => c.id === 'c1')!;
      expect(movedCard.position).toBe(pos);
    });

    it('moves a card to a different non-empty list in the middle', () => {
      useBoardStore.setState({
        lists: [
          makeList({
            id: 'list-1',
            position: 65536,
            cards: [makeCard({ id: 'c1', listId: 'list-1', position: 10000 })],
          }),
          makeList({
            id: 'list-2',
            position: 131072,
            cards: [
              makeCard({ id: 'c2', listId: 'list-2', position: 20000 }),
              makeCard({ id: 'c3', listId: 'list-2', position: 40000 }),
              makeCard({ id: 'c4', listId: 'list-2', position: 60000 }),
            ],
          }),
        ],
      });

      // Insert at index 1 -> between toCards[0] (20000) and toCards[1] (40000)
      const pos = useBoardStore.getState().moveCardLocally('c1', 'list-1', 'list-2', 1);

      expect(pos).toBe((20000 + 40000) / 2);
      expect(pos).toBeGreaterThan(20000);
      expect(pos).toBeLessThan(40000);

      const list2 = useBoardStore.getState().lists.find((l) => l.id === 'list-2')!;
      const movedCard = list2.cards.find((c) => c.id === 'c1')!;
      expect(movedCard.position).toBe(pos);
    });

    it('removes the card from the source list after a cross-list move', () => {
      useBoardStore.setState({
        lists: [
          makeList({
            id: 'list-1',
            position: 65536,
            cards: [
              makeCard({ id: 'c1', listId: 'list-1', position: 10000 }),
              makeCard({ id: 'c2', listId: 'list-1', position: 20000 }),
            ],
          }),
          makeList({ id: 'list-2', position: 131072, cards: [] }),
        ],
      });

      useBoardStore.getState().moveCardLocally('c1', 'list-1', 'list-2', 0);

      const list1 = useBoardStore.getState().lists.find((l) => l.id === 'list-1')!;
      expect(list1.cards).toHaveLength(1);
      expect(list1.cards.find((c) => c.id === 'c1')).toBeUndefined();
      expect(list1.cards[0].id).toBe('c2');
    });

    it('adds the card to the destination list after a cross-list move', () => {
      useBoardStore.setState({
        lists: [
          makeList({
            id: 'list-1',
            position: 65536,
            cards: [makeCard({ id: 'c1', listId: 'list-1', position: 10000 })],
          }),
          makeList({
            id: 'list-2',
            position: 131072,
            cards: [makeCard({ id: 'c2', listId: 'list-2', position: 20000 })],
          }),
        ],
      });

      useBoardStore.getState().moveCardLocally('c1', 'list-1', 'list-2', 1);

      const list2 = useBoardStore.getState().lists.find((l) => l.id === 'list-2')!;
      expect(list2.cards).toHaveLength(2);
      const movedCard = list2.cards.find((c) => c.id === 'c1')!;
      expect(movedCard).toBeDefined();
      expect(movedCard.listId).toBe('list-2');
    });
  });

  describe('moveListLocally', () => {
    function setupThreeLists() {
      useBoardStore.setState({
        lists: [
          makeList({ id: 'list-a', position: 10000, name: 'A' }),
          makeList({ id: 'list-b', position: 20000, name: 'B' }),
          makeList({ id: 'list-c', position: 30000, name: 'C' }),
        ],
      });
    }

    it('moves a list to the first position', () => {
      setupThreeLists();

      // Move list-c to index 0 (remaining sorted: [list-a(10000), list-b(20000)])
      const pos = useBoardStore.getState().moveListLocally('list-c', 0);

      // newIndex === 0, so position = without[0].position / 2 = 10000 / 2
      expect(pos).toBe(10000 / 2);
      expect(pos).toBeLessThan(10000);

      const listC = useBoardStore.getState().lists.find((l) => l.id === 'list-c')!;
      expect(listC.position).toBe(pos);
    });

    it('moves a list to the last position', () => {
      setupThreeLists();

      // Move list-a to index 2 (remaining sorted: [list-b(20000), list-c(30000)])
      // newIndex (2) >= without.length (2), so position = last.position + 65536 = 30000 + 65536
      const pos = useBoardStore.getState().moveListLocally('list-a', 2);

      expect(pos).toBe(30000 + 65536);
      expect(pos).toBeGreaterThan(30000);

      const listA = useBoardStore.getState().lists.find((l) => l.id === 'list-a')!;
      expect(listA.position).toBe(pos);
    });

    it('moves a list to a middle position', () => {
      setupThreeLists();

      // Move list-a to index 1 (remaining sorted: [list-b(20000), list-c(30000)])
      // newIndex=1 -> between without[0] and without[1] -> (20000 + 30000) / 2
      const pos = useBoardStore.getState().moveListLocally('list-a', 1);

      expect(pos).toBe((20000 + 30000) / 2);
      expect(pos).toBeGreaterThan(20000);
      expect(pos).toBeLessThan(30000);

      const listA = useBoardStore.getState().lists.find((l) => l.id === 'list-a')!;
      expect(listA.position).toBe(pos);
    });

    it('does not change positions of other lists', () => {
      setupThreeLists();

      useBoardStore.getState().moveListLocally('list-a', 2);

      const lists = useBoardStore.getState().lists;
      const listB = lists.find((l) => l.id === 'list-b')!;
      const listC = lists.find((l) => l.id === 'list-c')!;

      expect(listB.position).toBe(20000);
      expect(listC.position).toBe(30000);
    });
  });
});
