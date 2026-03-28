import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore, type Notification } from '../../stores/notificationStore.js';
import { useSocket } from '../../hooks/useSocket.js';
import { WS_EVENTS } from '@mello/shared';

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
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function notificationText(n: Notification): string {
  switch (n.type) {
    case 'mention':
      return `${n.data.actorDisplayName} mentioned you in "${n.data.cardName}"`;
    case 'card_assigned':
      return `${n.data.actorDisplayName} assigned you to "${n.data.cardName}"`;
    case 'board_added':
      return `${n.data.actorDisplayName} added you to board "${n.data.boardName}"`;
    default:
      return 'New notification';
  }
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { socket, isConnected } = useSocket();

  const {
    notifications,
    unreadCount,
    loading,
    hasMore,
    fetchNotifications,
    loadMore,
    markRead,
    markAllRead,
    prependNotification,
  } = useNotificationStore();

  // Fetch on first open
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (isOpen && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Fetch unread count on mount
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Listen for socket notifications
  useEffect(() => {
    if (!isConnected) return;

    const handler = (data: Notification) => {
      prependNotification(data);
    };

    socket.on(WS_EVENTS.NOTIFICATION, handler);
    return () => {
      socket.off(WS_EVENTS.NOTIFICATION, handler);
    };
  }, [isConnected, socket, prependNotification]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Infinite scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loading || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      loadMore();
    }
  }, [loading, hasMore, loadMore]);

  const handleNotificationClick = (n: Notification) => {
    if (!n.read) {
      markRead([n.id]);
    }
    setIsOpen(false);
    if (n.data.cardId && n.data.boardId) {
      navigate(`/b/${n.data.boardId}?card=${n.data.cardId}`);
    } else if (n.data.boardId) {
      navigate(`/b/${n.data.boardId}`);
    }
  };

  const handleMarkAllRead = () => {
    markAllRead();
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="relative p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        title="Notifications"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="text-base font-semibold text-gray-800">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Notifications list */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="max-h-[400px] overflow-y-auto"
          >
            {notifications.length === 0 && !loading && (
              <div className="py-8 text-center">
                <p className="text-base text-gray-500">No notifications yet</p>
              </div>
            )}

            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-b-0 transition-colors hover:bg-gray-50 ${
                  !n.read ? 'bg-blue-50/50' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Unread indicator */}
                  <div className="flex-shrink-0 pt-1.5">
                    {!n.read ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    ) : (
                      <div className="w-2.5 h-2.5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 leading-snug">
                      {notificationText(n)}
                    </p>
                    {n.type === 'mention' && n.data.commentSnippet && (
                      <p className="text-sm text-gray-500 mt-1 truncate">
                        "{n.data.commentSnippet}"
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {timeAgo(n.createdAt)}
                    </p>
                  </div>
                </div>
              </button>
            ))}

            {loading && (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
