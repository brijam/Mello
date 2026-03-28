import type { UserPublic } from './user.js';

export type BoardRole = 'admin' | 'normal' | 'observer';
export type BackgroundType = 'color' | 'image';

export interface Board {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  backgroundType: BackgroundType;
  backgroundValue: string;
  isTemplate: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface BoardMember {
  user: UserPublic;
  role: BoardRole;
  joinedAt: string;
}
