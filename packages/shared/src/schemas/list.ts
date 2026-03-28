import { z } from 'zod';

export const createListSchema = z.object({
  name: z.string().min(1).max(255),
  position: z.number().optional(),
});

export const updateListSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  position: z.number().optional(),
});

export const moveAllCardsSchema = z.object({
  targetListId: z.string().uuid(),
});

export type CreateListInput = z.infer<typeof createListSchema>;
export type UpdateListInput = z.infer<typeof updateListSchema>;
export type MoveAllCardsInput = z.infer<typeof moveAllCardsSchema>;
