import { db } from '../db/index.js';
import { notifications } from '../db/schema/notifications.js';

export async function createNotification(
  userId: string,
  type: string,
  data: Record<string, unknown>,
) {
  await db.insert(notifications).values({
    userId,
    type,
    data,
  });
}

export function parseMentions(text: string): string[] {
  const regex = /@([a-zA-Z0-9_-]+)/g;
  const usernames: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (!usernames.includes(match[1])) {
      usernames.push(match[1]);
    }
  }
  return usernames;
}
