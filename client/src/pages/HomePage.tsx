import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuthStore } from '../stores/authStore.js';
import type { Workspace } from '@mello/shared';

export default function HomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    api.get<{ workspaces: Array<Workspace & { role: string }> }>('/workspaces')
      .then((data) => {
        if (data.workspaces.length === 0) return;
        const preferred =
          (user?.defaultWorkspaceId &&
            data.workspaces.find((w) => w.id === user.defaultWorkspaceId)) ||
          data.workspaces[0];
        navigate(`/w/${preferred.id}`, { replace: true });
      });
  }, [navigate, user?.defaultWorkspaceId]);

  return <div className="flex items-center justify-center min-h-screen text-gray-500">Loading...</div>;
}
