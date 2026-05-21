// Mobile workspace boards screen (design 01). Lists the workspace's boards as
// vertical cards. Drag is intentionally disabled — reorder is a desktop affordance.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Board, Workspace } from '@mello/shared';
import { api } from '../../api/client.js';
import { useAuthStore } from '../../stores/authStore.js';
import MobileBottomBar, { Icon, useCommonActions } from './MobileBottomBar.js';
import MobileNotificationsSheet from './MobileNotificationsSheet.js';
import MobileSearchSheet from './MobileSearchSheet.js';
import { D, MOBILE_FONT_STACK, boardAccentColor } from './mobileTheme.js';

interface MobileBoardsViewProps {
  workspace: Workspace | null;
  boards: Board[];
  onCreate: (name: string) => Promise<void>;
}

export default function MobileBoardsView({ workspace, boards, onCreate }: MobileBoardsViewProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [showCreate, setShowCreate] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const sorted = [...boards].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const activeTab = showInbox ? 'notifications' : showSearch ? 'search' : 'boards';
  const common = useCommonActions({
    workspaceId: workspace?.id,
    activeTab,
    onNotifications: () => {
      setShowSearch(false);
      setShowInbox((v) => !v);
    },
    onSearch: () => {
      setShowInbox(false);
      setShowSearch((v) => !v);
    },
  });

  async function handleSubmit() {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await onCreate(name.trim());
      setName('');
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: D.bg,
        color: D.ink,
        fontFamily: MOBILE_FONT_STACK,
        paddingBottom: 80,
      }}
    >
      <header
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 12px)',
          paddingBottom: 12,
          paddingLeft: 18,
          paddingRight: 18,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              color: D.mute,
              fontWeight: 500,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}
          >
            Workspace
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, marginTop: 2 }}>
            {workspace?.name ?? 'Boards'}
          </div>
        </div>
      </header>

      <div style={{ padding: '4px 14px 0' }}>
        {sorted.length === 0 ? (
          <div
            style={{
              padding: '40px 24px',
              color: D.mute,
              textAlign: 'center',
              fontSize: 14,
            }}
          >
            No boards yet. Tap + to create one.
          </div>
        ) : (
          sorted.map((b) => {
            const accent = boardAccentColor(b as unknown as { accentColor: string | null; backgroundType: string; backgroundValue: string });
            const isImage = b.backgroundType === 'image';
            return (
              <button
                key={b.id}
                onClick={() => navigate(`/b/${b.id}`)}
                style={{
                  width: '100%',
                  background: D.surface,
                  border: `0.5px solid ${D.hair2}`,
                  borderRadius: 14,
                  marginBottom: 10,
                  padding: 0,
                  textAlign: 'left',
                  color: D.ink,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  display: 'flex',
                  fontFamily: MOBILE_FONT_STACK,
                }}
              >
                <div
                  style={{
                    width: 6,
                    background: isImage ? accent : b.backgroundValue,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, padding: '14px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        background: accent,
                        display: 'inline-block',
                      }}
                    />
                    <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.2 }}>
                      {b.name}
                    </span>
                  </div>
                  {b.description && (
                    <div style={{ color: D.mute, fontSize: 13, marginTop: 6, lineHeight: 1.4 }}>
                      {b.description}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    alignSelf: 'center',
                    paddingRight: 14,
                    color: D.mute,
                    flexShrink: 0,
                  }}
                >
                  <svg width="9" height="14" viewBox="0 0 9 14" fill="none">
                    <path
                      d="M2 2l5 5-5 5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </button>
            );
          })
        )}
      </div>

      {showCreate && (
        <div
          onClick={() => !creating && setShowCreate(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'flex-end',
            fontFamily: MOBILE_FONT_STACK,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: D.surface,
              width: '100%',
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              padding: 16,
              paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
            }}
          >
            <div style={{ width: 36, height: 4, background: D.hair3, borderRadius: 2, margin: '0 auto 12px' }} />
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 12, textAlign: 'center' }}>
              New board
            </div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
                if (e.key === 'Escape') setShowCreate(false);
              }}
              placeholder="Board name"
              style={{
                width: '100%',
                background: D.surface2,
                color: D.ink,
                border: `0.5px solid ${D.hair3}`,
                borderRadius: 10,
                padding: '12px 14px',
                fontSize: 16,
                fontFamily: MOBILE_FONT_STACK,
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                disabled={!name.trim() || creating}
                onClick={handleSubmit}
                style={{
                  flex: 1,
                  background: name.trim() ? D.sky : D.surface2,
                  color: name.trim() ? '#0A0A0A' : D.mute,
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px 0',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: name.trim() ? 'pointer' : 'default',
                  fontFamily: MOBILE_FONT_STACK,
                }}
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                style={{
                  flex: 1,
                  background: D.surface2,
                  color: D.ink,
                  border: `0.5px solid ${D.hair2}`,
                  borderRadius: 10,
                  padding: '12px 0',
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: MOBILE_FONT_STACK,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showMore && (
        <div
          onClick={() => setShowMore(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'flex-end',
            fontFamily: MOBILE_FONT_STACK,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: D.surface,
              width: '100%',
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
            }}
          >
            <div style={{ width: 36, height: 4, background: D.hair3, borderRadius: 2, margin: '8px auto' }} />
            <div style={{ padding: '6px 18px 12px', textAlign: 'center', fontSize: 14, color: D.mute }}>
              Signed in as {user?.displayName}
            </div>
            <button
              onClick={() => {
                setShowMore(false);
                navigate('/admin/users');
              }}
              style={menuRowStyle}
            >
              Users
            </button>
            <button
              onClick={async () => {
                setShowMore(false);
                await logout();
                navigate('/login');
              }}
              style={{ ...menuRowStyle, color: D.danger }}
            >
              Log out
            </button>
            <div style={{ height: 8, background: D.bg }} />
            <button
              onClick={() => setShowMore(false)}
              style={{
                width: 'calc(100% - 24px)',
                margin: '8px 12px 4px',
                background: D.surface2,
                color: D.ink,
                border: 'none',
                borderRadius: 12,
                padding: '14px 0',
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: MOBILE_FONT_STACK,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <MobileBottomBar
        actions={[
          common.boards(),
          common.notifications(),
          common.search(),
          {
            key: 'new',
            label: 'New',
            icon: Icon.PlusCircle,
            variant: 'primary',
            onClick: () => setShowCreate(true),
          },
          {
            key: 'more',
            label: 'More',
            icon: Icon.More,
            onClick: () => setShowMore(true),
          },
        ]}
      />

      {showInbox && <MobileNotificationsSheet onClose={() => setShowInbox(false)} />}
      {showSearch && <MobileSearchSheet onClose={() => setShowSearch(false)} />}
    </div>
  );
}

const menuRowStyle: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  borderTop: `0.5px solid ${D.hair}`,
  color: D.ink,
  padding: '14px 18px',
  fontSize: 16,
  fontWeight: 500,
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: MOBILE_FONT_STACK,
};

// Helper exported for WorkspacePage so it doesn't duplicate the create call.
export async function createBoardForWorkspace(workspaceId: string, name: string): Promise<Board> {
  const data = await api.post<{ board: Board }>('/boards', { workspaceId, name });
  return data.board;
}
