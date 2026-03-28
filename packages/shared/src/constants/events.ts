// Socket.IO event names
export const WS_EVENTS = {
  // Client -> Server
  JOIN_BOARD: 'board:join',
  LEAVE_BOARD: 'board:leave',

  // Server -> Client: Board events
  LIST_CREATED: 'board:list-created',
  LIST_UPDATED: 'board:list-updated',
  LIST_DELETED: 'board:list-deleted',
  LIST_REORDERED: 'board:list-reordered',

  CARD_CREATED: 'board:card-created',
  CARD_UPDATED: 'board:card-updated',
  CARD_MOVED: 'board:card-moved',
  CARD_DELETED: 'board:card-deleted',

  LABEL_CREATED: 'board:label-created',
  LABEL_UPDATED: 'board:label-updated',
  LABEL_DELETED: 'board:label-deleted',

  MEMBER_ADDED: 'board:member-added',
  MEMBER_REMOVED: 'board:member-removed',

  // Server -> Client: Card detail events
  COMMENT_ADDED: 'card:comment-added',
  COMMENT_UPDATED: 'card:comment-updated',
  COMMENT_DELETED: 'card:comment-deleted',
  CHECKLIST_UPDATED: 'card:checklist-updated',
  ATTACHMENT_ADDED: 'card:attachment-added',
  ATTACHMENT_DELETED: 'card:attachment-deleted',

  // Server -> Client: User events
  NOTIFICATION: 'user:notification',
} as const;
