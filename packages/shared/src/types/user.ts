export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  defaultWorkspaceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type UserPublic = Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
