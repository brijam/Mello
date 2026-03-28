import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import type { Workspace } from '@mello/shared';

export default function HomePage() {
  const navigate = useNavigate();

  useEffect(() => {
    api.get<{ workspaces: Array<Workspace & { role: string }> }>('/workspaces')
      .then((data) => {
        if (data.workspaces.length > 0) {
          navigate(`/w/${data.workspaces[0].id}`, { replace: true });
        }
      });
  }, [navigate]);

  return <div className="flex items-center justify-center min-h-screen text-gray-500">Loading...</div>;
}
