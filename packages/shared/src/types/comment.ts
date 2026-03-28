import type { UserPublic } from './user.js';

export interface Comment {
  id: string;
  cardId: string;
  user: UserPublic;
  body: string;
  editedAt: string | null;
  createdAt: string;
}
