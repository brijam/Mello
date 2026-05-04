import { z } from 'zod';

export const createCardSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  position: z.number().optional(),
  isTemplate: z.boolean().optional(),
});

export const updateCardSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  position: z.number().optional(),
  isTemplate: z.boolean().optional(),
  coverAttachmentId: z.string().uuid().nullable().optional(),
});

export const moveCardSchema = z.object({
  listId: z.string().uuid(),
  position: z.number(),
  boardId: z.string().uuid().optional(),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
export type MoveCardInput = z.infer<typeof moveCardSchema>;
