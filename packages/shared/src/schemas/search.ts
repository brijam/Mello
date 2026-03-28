import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required').max(200),
  workspaceId: z.string().uuid().optional(),
  boardId: z.string().uuid().optional(),
  labels: z.string().optional(),
  members: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
