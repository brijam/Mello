import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { boardMembers } from '../db/schema/boards.js';
import { workspaceMembers } from '../db/schema/workspaces.js';
import { cards } from '../db/schema/cards.js';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import type { BoardRole, WorkspaceRole } from '@mello/shared';

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.userId) {
    throw new UnauthorizedError();
  }
}

export function requireWorkspaceRole(...roles: WorkspaceRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.userId) throw new UnauthorizedError();
    const { workspaceId } = request.params as { workspaceId: string };
    if (!workspaceId) throw new NotFoundError('Workspace');

    const [member] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, request.userId),
        ),
      );

    if (!member || !roles.includes(member.role)) {
      throw new ForbiddenError();
    }
  };
}

export function requireBoardRole(...roles: BoardRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.userId) throw new UnauthorizedError();
    const { boardId } = request.params as { boardId: string };
    if (!boardId) throw new NotFoundError('Board');

    const [member] = await db
      .select()
      .from(boardMembers)
      .where(
        and(
          eq(boardMembers.boardId, boardId),
          eq(boardMembers.userId, request.userId),
        ),
      );

    if (!member || !roles.includes(member.role)) {
      throw new ForbiddenError();
    }
  };
}

export function requireBoardRoleViaCard(...roles: BoardRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.userId) throw new UnauthorizedError();
    const { cardId } = request.params as { cardId: string };
    if (!cardId) throw new NotFoundError('Card');

    const [card] = await db
      .select({ boardId: cards.boardId })
      .from(cards)
      .where(eq(cards.id, cardId));

    if (!card) throw new NotFoundError('Card');

    const [member] = await db
      .select()
      .from(boardMembers)
      .where(
        and(
          eq(boardMembers.boardId, card.boardId),
          eq(boardMembers.userId, request.userId),
        ),
      );

    if (!member || !roles.includes(member.role)) {
      throw new ForbiddenError();
    }
  };
}
