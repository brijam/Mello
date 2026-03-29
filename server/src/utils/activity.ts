import { db } from '../db/index.js';
import { activities } from '../db/schema/activities.js';

export async function logActivity(params: {
  cardId: string;
  boardId: string;
  userId: string;
  type: string;
  data?: Record<string, unknown>;
}) {
  await db.insert(activities).values({
    cardId: params.cardId,
    boardId: params.boardId,
    userId: params.userId,
    type: params.type,
    data: params.data ?? {},
  });
}
