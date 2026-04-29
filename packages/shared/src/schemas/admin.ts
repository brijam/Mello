import { z } from 'zod';

export const adminCreateUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(255),
  isAdmin: z.boolean().optional(),
});

export const adminUpdateUserSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  displayName: z.string().min(1).max(255).optional(),
  isAdmin: z.boolean().optional(),
});

export const adminResetPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

export const adminSetBoardRoleSchema = z.object({
  role: z.enum(['admin', 'normal', 'observer']),
});

export const adminSetWorkspaceRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'member']),
});

export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;
export type AdminSetBoardRoleInput = z.infer<typeof adminSetBoardRoleSchema>;
export type AdminSetWorkspaceRoleInput = z.infer<typeof adminSetWorkspaceRoleSchema>;
