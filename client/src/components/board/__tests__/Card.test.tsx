import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import Card from '../Card.js';

// Mock boardStore
vi.mock('../../../stores/boardStore.js', () => {
  const store = {
    deleteCard: vi.fn(),
    labels: [
      { id: 'label-1', name: 'Bug', color: 'red' },
      { id: 'label-2', name: 'Feature', color: 'blue' },
    ],
    members: [
      { id: 'member-1', displayName: 'Alice' },
      { id: 'member-2', displayName: 'Bob' },
    ],
  };
  return {
    useBoardStore: (selector?: (s: typeof store) => unknown) =>
      selector ? selector(store) : store,
  };
});

// Mock dnd-kit core (Card now uses useDraggable instead of useSortable)
vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  }),
}));

// Mock Modal and CardDetail
vi.mock('../../common/Modal.js', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="modal">{children}</div>,
}));

vi.mock('../../card/CardDetail.js', () => ({
  default: () => <div data-testid="card-detail" />,
}));

describe('Card component alignment', () => {
  const baseCard = {
    id: 'card-1',
    name: 'Test Card',
    description: null,
  };

  it('renders labels container aligned to the left', () => {
    const card = {
      ...baseCard,
      labelIds: ['label-1', 'label-2'],
    };

    const { container } = render(<Card card={card} listId="list-1" />);

    const labelsContainer = container.querySelector('.flex.flex-wrap.gap-1.mb-1\\.5');
    expect(labelsContainer).toBeInTheDocument();
    expect(labelsContainer).toHaveClass('justify-start');
  });

  it('renders members container aligned to the right', () => {
    const card = {
      ...baseCard,
      memberIds: ['member-1', 'member-2'],
    };

    const { container } = render(<Card card={card} listId="list-1" />);

    const membersContainer = container.querySelector('.flex.flex-wrap.gap-1.mt-1\\.5');
    expect(membersContainer).toBeInTheDocument();
    expect(membersContainer).toHaveClass('justify-end');
  });

  it('labels container does NOT have justify-end or justify-center', () => {
    const card = {
      ...baseCard,
      labelIds: ['label-1'],
    };

    const { container } = render(<Card card={card} listId="list-1" />);

    const labelsContainer = container.querySelector('.flex.flex-wrap.gap-1.mb-1\\.5');
    expect(labelsContainer).toBeInTheDocument();
    expect(labelsContainer).not.toHaveClass('justify-end');
    expect(labelsContainer).not.toHaveClass('justify-center');
  });

  it('members container does NOT have justify-start or justify-center', () => {
    const card = {
      ...baseCard,
      memberIds: ['member-1'],
    };

    const { container } = render(<Card card={card} listId="list-1" />);

    const membersContainer = container.querySelector('.flex.flex-wrap.gap-1.mt-1\\.5');
    expect(membersContainer).toBeInTheDocument();
    expect(membersContainer).not.toHaveClass('justify-start');
    expect(membersContainer).not.toHaveClass('justify-center');
  });
});
