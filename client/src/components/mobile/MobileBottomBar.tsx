// Bottom navigation bar shown across mobile screens. Action items are passed in
// so each screen can supply contextual buttons (e.g. "+ New card" on a board).

import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../../stores/notificationStore.js';
import { D, MOBILE_FONT_STACK } from './mobileTheme.js';

export interface BottomBarAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'danger';
  badge?: number;
  active?: boolean;
}

interface MobileBottomBarProps {
  actions: BottomBarAction[];
}

export default function MobileBottomBar({ actions }: MobileBottomBarProps) {
  return (
    <nav
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(10,10,10,0.92)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderTop: `0.5px solid ${D.hair2}`,
        paddingTop: 8,
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
        paddingLeft: 4,
        paddingRight: 4,
        zIndex: 30,
        fontFamily: MOBILE_FONT_STACK,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'space-around',
          maxWidth: 540,
          margin: '0 auto',
        }}
      >
        {actions.map((a) => {
          const color = a.active
            ? D.sky
            : a.variant === 'danger'
              ? D.danger
              : D.mute;
          return (
            <button
              key={a.key}
              onClick={a.onClick}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                padding: '4px 6px',
                fontSize: 10,
                fontWeight: a.active ? 600 : 500,
                letterSpacing: 0.1,
                cursor: 'pointer',
                position: 'relative',
                minWidth: 0,
              }}
            >
              <span style={{ position: 'relative', height: 22, display: 'inline-flex', alignItems: 'center' }}>
                {a.icon}
                {typeof a.badge === 'number' && a.badge > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -10,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 8,
                      background: D.danger,
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '0 4px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: `0 0 0 2px rgba(10,10,10,0.92)`,
                    }}
                  >
                    {a.badge > 99 ? '99+' : a.badge}
                  </span>
                )}
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>{a.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// Icons reused across mobile screens. Defined here so callers stay small.
export const Icon = {
  Boards: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="7" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14" y="4" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  Bell: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 8a6 6 0 0112 0v3l1.5 3.5h-15L6 11V8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9.5 17.5a2.5 2.5 0 005 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  Search: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="10.5" cy="10.5" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15 15l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  Plus: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  PlusCircle: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  More: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="6" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" />
    </svg>
  ),
  Filter: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 6h16M7 12h10M10 18h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
};

// Hook returning common bottom-bar actions usable from any screen. The hook
// owner supplies behavior for notifications/search via callbacks because the
// presentation differs per screen (sheet, full-screen, etc.).
export type MobileTabKey = 'boards' | 'notifications' | 'search' | null;

export function useCommonActions(opts: {
  workspaceId?: string;
  activeTab?: MobileTabKey;
  onNotifications: () => void;
  onSearch: () => void;
}) {
  const navigate = useNavigate();
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const boards = (): BottomBarAction => ({
    key: 'boards',
    label: 'Boards',
    icon: Icon.Boards,
    active: opts.activeTab === 'boards',
    onClick: () => {
      if (opts.workspaceId) navigate(`/w/${opts.workspaceId}`);
    },
  });

  const notifications = (): BottomBarAction => ({
    key: 'notifications',
    label: 'Inbox',
    icon: Icon.Bell,
    badge: unreadCount,
    active: opts.activeTab === 'notifications',
    onClick: opts.onNotifications,
  });

  const search = (): BottomBarAction => ({
    key: 'search',
    label: 'Search',
    icon: Icon.Search,
    active: opts.activeTab === 'search',
    onClick: opts.onSearch,
  });

  return { boards, notifications, search };
}
