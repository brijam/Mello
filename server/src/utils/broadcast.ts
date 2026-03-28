import type { Server } from 'socket.io';

/**
 * Broadcast an event to all clients in a board room.
 */
export function broadcast(
  io: Server,
  boardId: string,
  event: string,
  data: unknown,
  excludeSocketId?: string,
) {
  const room = `board:${boardId}`;
  if (excludeSocketId) {
    io.to(room).except(excludeSocketId).emit(event, data);
  } else {
    io.to(room).emit(event, data);
  }
}
