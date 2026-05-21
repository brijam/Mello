// Bottom-up full-screen sheet listing the user's notifications. Tapping a
// notification marks it read and navigates to the relevant card/board.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore, type Notification } from '../../stores/notificationStore.js';
import { MOBILE_BOTTOM_BAR_HEIGHT } from './MobileBottomBar.js';
import { D, MOBILE_FONT_STACK } from './mobileTheme.js';

interface MobileNotificationsSheetProps {
  onClose: () => void;
}

export default function MobileNotificationsSheet({ onClose }: MobileNotificationsSheetProps) {
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const loading = useNotificationStore((s) => s.loading);
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotifications(true);
  }, [fetchNotifications]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: MOBILE_BOTTOM_BAR_HEIGHT,
        background: D.bg,
        color: D.ink,
        zIndex: 20,
        fontFamily: MOBILE_FONT_STACK,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 'max(env(safe-area-inset-top), 10px)',
          paddingBottom: 10,
          paddingLeft: 16,
          paddingRight: 12,
          borderBottom: `0.5px solid ${D.hair}`,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600 }}>Inbox</div>
        <button
          disabled={unreadCount === 0}
          onClick={markAllRead}
          style={{
            background: 'transparent',
            border: 'none',
            color: unreadCount > 0 ? D.sky : D.mute2,
            padding: 8,
            fontSize: 14,
            cursor: unreadCount > 0 ? 'pointer' : 'default',
          }}
        >
          Mark all
        </button>
      </header>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && notifications.length === 0 && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: D.mute, fontSize: 14 }}>
            Loading…
          </div>
        )}
        {!loading && notifications.length === 0 && (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: D.mute, fontSize: 14 }}>
            No notifications yet.
          </div>
        )}
        {notifications.map((n) => (
          <NotificationRow
            key={n.id}
            n={n}
            onTap={() => {
              if (!n.read) markRead([n.id]);
              if (n.data.cardId && n.data.boardId) {
                navigate(`/b/${n.data.boardId}?card=${n.data.cardId}`);
              } else if (n.data.boardId) {
                navigate(`/b/${n.data.boardId}`);
              }
              onClose();
            }}
          />
        ))}
      </div>
    </div>
  );
}

function NotificationRow({ n, onTap }: { n: Notification; onTap: () => void }) {
  let line = '';
  if (n.type === 'mention') {
    line = `${n.data.actorDisplayName} mentioned you${n.data.cardName ? ` on "${n.data.cardName}"` : ''}`;
  } else if (n.type === 'card_assigned') {
    line = `${n.data.actorDisplayName} assigned you to ${n.data.cardName ?? 'a card'}`;
  } else if (n.type === 'board_added') {
    line = `${n.data.actorDisplayName} added you to ${n.data.boardName ?? 'a board'}`;
  }
  return (
    <button
      onClick={onTap}
      style={{
        width: '100%',
        background: n.read ? 'transparent' : 'rgba(91,168,255,0.07)',
        border: 'none',
        borderBottom: `0.5px solid ${D.hair}`,
        color: D.ink,
        padding: '14px 18px',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        fontFamily: MOBILE_FONT_STACK,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          background: n.read ? 'transparent' : D.sky,
          marginTop: 7,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, lineHeight: 1.35 }}>{line}</div>
        {n.data.commentSnippet && (
          <div
            style={{
              marginTop: 4,
              color: D.mute,
              fontSize: 13,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {n.data.commentSnippet}
          </div>
        )}
      </div>
    </button>
  );
}
