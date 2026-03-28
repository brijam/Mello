import { z } from 'zod';

export const createChecklistSchema = z.object({
  name: z.string().min(1).max(255),
  position: z.number().optional(),
});

export const updateChecklistSchema = z.object({
  name: z.string().min(1).max(255),
});

export const createChecklistItemSchema = z.object({
  name: z.string().min(1),
  position: z.number().optional(),
});

export const updateChecklistItemSchema = z.object({
  name: z.string().min(1).optional(),
  checked: z.boolean().optional(),
  position: z.number().optional(),
});

export type CreateChecklistInput = z.infer<typeof createChecklistSchema>;
export type UpdateChecklistInput = z.infer<typeof updateChecklistSchema>;
export type CreateChecklistItemInput = z.infer<typeof createChecklistItemSchema>;
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;
