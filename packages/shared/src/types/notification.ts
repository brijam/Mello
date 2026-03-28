export type NotificationType = 'mention' | 'assignment' | 'comment' | 'board_invite';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  data: {
    cardId?: string;
    boardId?: string;
    actorId: string;
    actorName: string;
    message: string;
  };
  read: boolean;
  createdAt: string;
}
