import type { UserPublic } from './user.js';

export type WorkspaceRole = 'owner' | 'admin' | 'member';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  user: UserPublic;
  role: WorkspaceRole;
  joinedAt: string;
}
