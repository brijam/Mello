import { z } from 'zod';

export const createBoardSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  backgroundType: z.enum(['color', 'image']).default('color'),
  backgroundValue: z.string().default('#0079bf'),
});

export const updateBoardSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  backgroundType: z.enum(['color', 'image']).optional(),
  backgroundValue: z.string().optional(),
});

export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;
