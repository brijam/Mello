import { z } from 'zod';

export const createCardSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  position: z.number().optional(),
  isTemplate: z.boolean().optional(),
});

export const agentMetaSchema = z.object({
  agentType: z.enum(['code', 'research', 'review']),
  repoPath: z.string().min(1),
  branch: z.string().optional(),
  model: z.enum(['opus', 'sonnet', 'haiku']).optional(),
  maxTurns: z.number().int().positive().optional(),
  costCapUsd: z.number().positive().optional(),
  allowedTools: z.array(z.string()).optional(),
  status: z.enum(['idle', 'running', 'awaiting_input', 'failed', 'done']).optional(),
  runId: z.string().optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  lastError: z.string().optional(),
});

export const updateCardSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  position: z.number().optional(),
  isTemplate: z.boolean().optional(),
  coverAttachmentId: z.string().uuid().nullable().optional(),
  agentMeta: agentMetaSchema.nullable().optional(),
});

export const moveCardSchema = z.object({
  listId: z.string().uuid(),
  position: z.number(),
  boardId: z.string().uuid().optional(),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
export type MoveCardInput = z.infer<typeof moveCardSchema>;
