import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { boardBackgrounds } from '../db/schema/board-backgrounds.js';
import { listColors } from '../db/schema/list-colors.js';

// Per-user color/background resolution helpers.
//
// Board background and list color are personal preferences: the boards/lists
// rows hold a shared *default*, and a row in board_backgrounds / list_colors
// overrides it for a single user. Reads COALESCE the override over the default;
// writes go to the override tables (see the board/list routes).

type BoardLike = { id: string; backgroundType: 'color' | 'image'; backgroundValue: string };

/** Fetch one user's board background override, or null if they use the default. */
export async function getUserBoardBackground(boardId: string, userId: string) {
  const [row] = await db
    .select()
    .from(boardBackgrounds)
    .where(and(eq(boardBackgrounds.boardId, boardId), eq(boardBackgrounds.userId, userId)));
  return row
    ? { backgroundType: row.backgroundType, backgroundValue: row.backgroundValue }
    : null;
}

/** Apply a single board's per-user override (if any) to the board row. */
export async function withUserBoardBackground<T extends BoardLike>(board: T, userId: string): Promise<T> {
  const override = await getUserBoardBackground(board.id, userId);
  return override ? { ...board, ...override } : board;
}

/** Apply per-user overrides to a list of boards in one query (e.g. workspace tiles). */
export async function withUserBoardBackgrounds<T extends BoardLike>(boards: T[], userId: string): Promise<T[]> {
  if (boards.length === 0) return boards;
  const rows = await db
    .select()
    .from(boardBackgrounds)
    .where(and(
      inArray(boardBackgrounds.boardId, boards.map((b) => b.id)),
      eq(boardBackgrounds.userId, userId),
    ));
  const byBoard = new Map(rows.map((r) => [r.boardId, r]));
  return boards.map((b) => {
    const o = byBoard.get(b.id);
    return o ? { ...b, backgroundType: o.backgroundType, backgroundValue: o.backgroundValue } : b;
  });
}

/** Apply per-user color overrides to a list of lists in one query. */
export async function withUserListColors<T extends { id: string; color: string | null }>(
  lists: T[],
  userId: string,
): Promise<T[]> {
  if (lists.length === 0) return lists;
  const rows = await db
    .select()
    .from(listColors)
    .where(and(
      inArray(listColors.listId, lists.map((l) => l.id)),
      eq(listColors.userId, userId),
    ));
  const byList = new Map(rows.map((r) => [r.listId, r.color]));
  return lists.map((l) => (byList.has(l.id) ? { ...l, color: byList.get(l.id)! } : l));
}
