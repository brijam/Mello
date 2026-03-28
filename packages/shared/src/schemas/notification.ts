import { z } from 'zod';

export const listNotificationsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  cursor: z.string().uuid().optional(),
  unread: z.enum(['true', 'false']).optional(),
});

export const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export type ListNotificationsInput = z.infer<typeof listNotificationsSchema>;
export type MarkReadInput = z.infer<typeof markReadSchema>;
