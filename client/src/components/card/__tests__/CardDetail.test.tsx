import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, screen, fireEvent } from '@testing-library/react';
import CardDetail from '../CardDetail.js';

// --- Mocks ---

const mockGet = vi.fn();
vi.mock('../../../api/client.js', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../stores/boardStore.js', () => ({
  useBoardStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      lists: [{ id: 'list-1', name: 'To Do' }],
      labels: [{ id: 'label-1', name: 'Bug', color: 'red' }],
      members: [{ id: 'user-1', username: 'john', displayName: 'John', avatarUrl: null }],
      deleteCard: vi.fn(),
      updateCard: vi.fn(),
      toggleCardLabel: vi.fn(),
    }),
}));

vi.mock('../../../stores/authStore.js', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ user: { id: 'user-1', username: 'john' } }),
}));

vi.mock('../MarkdownRenderer.js', () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown-renderer">{content}</div>,
}));

vi.mock('../CardChecklist.js', () => ({
  default: () => <div data-testid="card-checklist" />,
}));

vi.mock('../CardComments.js', () => ({
  default: () => <div data-testid="card-comments" />,
}));

vi.mock('../CardAttachments.js', () => ({
  default: () => <div data-testid="card-attachments" />,
}));

vi.mock('../../board/LabelBadge.js', () => ({
  default: ({ name, color }: { name: string; color: string }) => (
    <div data-testid="label-badge" data-color={color}>{name}</div>
  ),
}));

vi.mock('../LabelPicker.js', () => ({
  default: () => <div data-testid="label-picker" />,
}));

vi.mock('../MemberPicker.js', () => ({
  default: () => <div data-testid="member-picker" />,
}));

// --- Mock data ---

const mockCard = {
  id: 'card-1',
  listId: 'list-1',
  boardId: 'board-1',
  name: 'Test Card',
  description: 'Test description',
  position: 1,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  labels: [{ id: 'label-1', name: 'Bug', color: 'red' }],
  members: [{ id: 'user-1', username: 'john', displayName: 'John', avatarUrl: null }],
  checklists: [],
  attachments: [],
  commentCount: 0,
};

const mockCardNoLabels = {
  ...mockCard,
  labels: [],
};

const mockCardNoMembers = {
  ...mockCard,
  members: [],
};

// --- Helpers ---

function renderCardDetail() {
  const onClose = vi.fn();
  const result = render(<CardDetail cardId="card-1" onClose={onClose} />);
  return { ...result, onClose };
}

// --- Tests ---

describe('CardDetail layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ card: mockCard });
  });

  it('labels appear in header before the two-column body', async () => {
    const { container } = renderCardDetail();

    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeInTheDocument();
    });

    // Labels should be in the header area (p-6 pb-2 pr-12 div), not in the main content column
    const header = container.querySelector('.pb-2');
    expect(header).not.toBeNull();

    const labelBadge = header!.querySelector('[data-testid="label-badge"]');
    expect(labelBadge).not.toBeNull();

    // Labels should appear before the Description heading in DOM order
    const descriptionHeading = screen.getByText('Description');
    const position = labelBadge!.compareDocumentPosition(descriptionHeading);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('member avatars appear in header next to card title', async () => {
    const { container } = renderCardDetail();

    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeInTheDocument();
    });

    // Members should be in the header area next to the title
    const header = container.querySelector('.pb-2');
    expect(header).not.toBeNull();

    // Find the member avatar by its title attribute
    const memberAvatar = header!.querySelector('[title="John"]');
    expect(memberAvatar).not.toBeNull();

    // The sidebar should NOT contain a members display section
    const sidebar = container.querySelector('.w-\\[24rem\\]');
    expect(sidebar).not.toBeNull();
    const sidebarSections = sidebar!.querySelectorAll('section.bg-gray-50');
    expect(sidebarSections.length).toBe(0);
  });

  it('members dropdown has a close button that closes the picker', async () => {
    renderCardDetail();

    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeInTheDocument();
    });

    // Find the "Members" action button in the sidebar (not the heading).
    const membersButtons = screen.getAllByRole('button', { name: /^Members$/i });
    const membersActionButton = membersButtons.find(
      (btn) => btn.tagName === 'BUTTON' && btn.classList.contains('bg-gray-200')
    );
    expect(membersActionButton).toBeDefined();

    // Click to open the member picker dropdown
    fireEvent.click(membersActionButton!);

    // Verify the member picker is shown
    await waitFor(() => {
      expect(screen.getByTestId('member-picker')).toBeInTheDocument();
    });

    // Look for a close button (x / times character) within the dropdown
    const dropdown = screen.getByTestId('member-picker').closest('.absolute');
    expect(dropdown).not.toBeNull();

    const closeButton = dropdown!.querySelector('button');
    expect(closeButton).not.toBeNull();
    expect(closeButton!.textContent).toMatch(/×|✕|close|x/i);

    // Click the close button
    fireEvent.click(closeButton!);

    // The member picker dropdown should now be closed
    await waitFor(() => {
      expect(screen.queryByTestId('member-picker')).not.toBeInTheDocument();
    });
  });

  it('labels section is not rendered when card has no labels', async () => {
    mockGet.mockResolvedValue({ card: mockCardNoLabels });
    const { container } = renderCardDetail();

    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeInTheDocument();
    });

    // The left column (main content) should not contain a Labels heading
    // before the Description heading. Look in the main content area (flex-1).
    const mainContent = container.querySelector('.flex-1.min-w-0');
    expect(mainContent).not.toBeNull();

    const headings = mainContent!.querySelectorAll('h3');
    const labelsHeadings = Array.from(headings).filter(
      (h) => h.textContent?.trim() === 'Labels'
    );

    // No Labels heading should appear in the main content when there are no labels
    expect(labelsHeadings.length).toBe(0);
  });

  it('members section is not rendered in sidebar when card has no members', async () => {
    mockGet.mockResolvedValue({ card: mockCardNoMembers });
    const { container } = renderCardDetail();

    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeInTheDocument();
    });

    // The sidebar should not contain a Members heading section
    const sidebar = container.querySelector('.w-\\[24rem\\]');
    expect(sidebar).not.toBeNull();

    const sidebarHeadings = sidebar!.querySelectorAll('h3');
    const membersHeadings = Array.from(sidebarHeadings).filter(
      (h) => h.textContent?.trim() === 'Members'
    );

    // No Members heading in the sidebar when card has no members
    expect(membersHeadings.length).toBe(0);
  });
});
