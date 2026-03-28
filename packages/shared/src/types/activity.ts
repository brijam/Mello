import type { UserPublic } from './user.js';

export type ActivityType =
  | 'card_created'
  | 'card_moved'
  | 'card_updated'
  | 'card_deleted'
  | 'member_added'
  | 'member_removed'
  | 'label_added'
  | 'label_removed'
  | 'checklist_added'
  | 'checklist_removed'
  | 'checklist_item_checked'
  | 'checklist_item_unchecked'
  | 'attachment_added'
  | 'attachment_removed'
  | 'comment_added';

export interface Activity {
  id: string;
  cardId: string;
  boardId: string;
  user: UserPublic;
  type: ActivityType;
  data: Record<string, unknown>;
  createdAt: string;
}
