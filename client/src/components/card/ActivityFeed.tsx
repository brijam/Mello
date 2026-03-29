import { useState, useEffect } from 'react';
import { api } from '../../api/client.js';

interface ActivityUser {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
}

interface Activity {
  id: string;
  cardId: string;
  boardId: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
  user: ActivityUser;
}

function formatActivity(activity: Activity): string {
  const name = activity.user.displayName;
  const d = activity.data;
  switch (activity.type) {
    case 'card_created': return `${name} created this card`;
    case 'card_updated': return `${name} updated this card`;
    case 'card_moved': return `${name} moved this card from ${d.fromList ?? 'a list'} to ${d.toList ?? 'a list'}`;
    case 'card_deleted': return `${name} deleted this card`;
    case 'member_added': return `${name} added ${d.memberName ?? 'a member'} to this card`;
    case 'member_removed': return `${name} removed ${d.memberName ?? 'a member'} from this card`;
    case 'label_added': return `${name} added the ${d.labelName ?? d.labelColor ?? ''} label`;
    case 'label_removed': return `${name} removed the ${d.labelName ?? d.labelColor ?? ''} label`;
    case 'checklist_added': return `${name} added checklist "${d.checklistName ?? ''}"`;
    case 'checklist_removed': return `${name} removed checklist "${d.checklistName ?? ''}"`;
    case 'checklist_item_checked': return `${name} completed "${d.itemName ?? ''}" on ${d.checklistName ?? 'a checklist'}`;
    case 'checklist_item_unchecked': return `${name} unchecked "${d.itemName ?? ''}" on ${d.checklistName ?? 'a checklist'}`;
    case 'attachment_added': return `${name} attached ${d.fileName ?? 'a file'}`;
    case 'attachment_removed': return `${name} removed attachment ${d.fileName ?? ''}`;
    case 'comment_added': return `${name} added a comment`;
    default: return `${name} performed an action`;
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface ActivityFeedProps {
  cardId: string;
  refreshKey?: number;
}

const LIMIT = 20;

export default function ActivityFeed({ cardId, refreshKey }: ActivityFeedProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setOffset(0);
    api
      .get<{ activities: Activity[] }>(`/cards/${cardId}/activities?limit=${LIMIT}&offset=0`)
      .then((data) => {
        if (!cancelled) {
          setActivities(data.activities);
          setHasMore(data.activities.length === LIMIT);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActivities([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cardId, refreshKey]);

  const handleShowMore = async () => {
    const newOffset = offset + LIMIT;
    setLoadingMore(true);
    try {
      const data = await api.get<{ activities: Activity[] }>(
        `/cards/${cardId}/activities?limit=${LIMIT}&offset=${newOffset}`,
      );
      setActivities((prev) => [...prev, ...data.activities]);
      setHasMore(data.activities.length === LIMIT);
      setOffset(newOffset);
    } catch {
      // ignore
    }
    setLoadingMore(false);
  };

  if (loading) {
    return <p className="text-sm text-gray-400">Loading activity...</p>;
  }

  if (activities.length === 0) {
    return <p className="text-sm text-gray-400">No activity yet.</p>;
  }

  return (
    <div className="space-y-3">
      {activities.map((activity) => (
        <div key={activity.id} className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-500 flex-shrink-0 flex items-center justify-center text-xs font-bold text-white overflow-hidden">
            {activity.user.avatarUrl ? (
              <img
                src={activity.user.avatarUrl}
                alt={activity.user.displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              activity.user.displayName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-gray-700">{formatActivity(activity)}</p>
            <p className="text-xs text-gray-400">{timeAgo(activity.createdAt)}</p>
          </div>
        </div>
      ))}
      {hasMore && (
        <button
          onClick={handleShowMore}
          disabled={loadingMore}
          className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
        >
          {loadingMore ? 'Loading...' : 'Show more'}
        </button>
      )}
    </div>
  );
}
