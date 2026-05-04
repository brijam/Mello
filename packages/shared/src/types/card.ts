import type { UserPublic } from './user.js';
import type { Label } from './label.js';
import type { Checklist } from './checklist.js';
import type { Attachment } from './attachment.js';

export interface Card {
  id: string;
  listId: string;
  boardId: string;
  name: string;
  description: string | null;
  position: number;
  coverAttachmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CardDetail extends Card {
  labels: Label[];
  members: UserPublic[];
  checklists: Checklist[];
  attachments: Attachment[];
  commentCount: number;
}
