// iOS-style bottom action sheet for list actions (rename, change color, delete).
// Also used by the "+" menu in the tab strip for "Add list".

import { useState } from 'react';
import { useBoardStore } from '../../stores/boardStore.js';
import { D, MOBILE_FONT_STACK, MOBILE_PALETTE } from './mobileTheme.js';

interface ListMenuProps {
  list: { id: string; name: string; color: string | null };
  onClose: () => void;
}

export default function MobileListMenu({ list, onClose }: ListMenuProps) {
  const updateList = useBoardStore((s) => s.updateList);
  const deleteList = useBoardStore((s) => s.deleteList);
  const [mode, setMode] = useState<'menu' | 'rename' | 'color' | 'confirmDelete'>('menu');
  const [nameValue, setNameValue] = useState(list.name);

  const close = () => onClose();

  return (
    <Sheet onClose={close}>
      {mode === 'menu' && (
        <>
          <SheetHeader title={list.name} />
          <ActionRow
            label="Rename list"
            onClick={() => setMode('rename')}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 20h4l10-10-4-4L4 16v4z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />
          <ActionRow
            label="Change color"
            onClick={() => setMode('color')}
            icon={
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  background: list.color ?? D.mute,
                  border: `1px solid ${D.hair2}`,
                  display: 'inline-block',
                }}
              />
            }
          />
          <Divider />
          <ActionRow
            label="Delete list"
            danger
            onClick={() => setMode('confirmDelete')}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M7 7l1 12a2 2 0 002 2h4a2 2 0 002-2l1-12"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />
          <CancelRow onClick={close} />
        </>
      )}

      {mode === 'rename' && (
        <>
          <SheetHeader title="Rename list" />
          <div style={{ padding: '8px 16px 16px' }}>
            <input
              autoFocus
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setMode('menu')}
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
              <PrimaryButton
                onClick={async () => {
                  const v = nameValue.trim();
                  if (v && v !== list.name) {
                    await updateList(list.id, { name: v });
                  }
                  close();
                }}
              >
                Save
              </PrimaryButton>
              <SecondaryButton onClick={() => setMode('menu')}>Back</SecondaryButton>
            </div>
          </div>
        </>
      )}

      {mode === 'color' && (
        <>
          <SheetHeader title="List color" />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 10,
              padding: '8px 18px 18px',
            }}
          >
            <ColorSwatch
              color={null}
              active={list.color === null}
              onClick={async () => {
                await updateList(list.id, { color: null });
                close();
              }}
            />
            {MOBILE_PALETTE.map((c) => (
              <ColorSwatch
                key={c}
                color={c}
                active={list.color === c}
                onClick={async () => {
                  await updateList(list.id, { color: c });
                  close();
                }}
              />
            ))}
          </div>
          <CancelRow onClick={() => setMode('menu')} label="Back" />
        </>
      )}

      {mode === 'confirmDelete' && (
        <>
          <SheetHeader
            title="Delete list?"
            subtitle="This will remove the list and all its cards. This cannot be undone."
          />
          <div style={{ padding: '0 16px 12px' }}>
            <button
              onClick={async () => {
                await deleteList(list.id);
                close();
              }}
              style={{
                width: '100%',
                background: D.danger,
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                padding: '14px 0',
                fontSize: 16,
                fontWeight: 600,
                fontFamily: MOBILE_FONT_STACK,
                cursor: 'pointer',
              }}
            >
              Delete list
            </button>
          </div>
          <CancelRow onClick={() => setMode('menu')} label="Back" />
        </>
      )}
    </Sheet>
  );
}

// --- Reusable bottom-sheet primitives ----------------------------------------

export function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        fontFamily: MOBILE_FONT_STACK,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 540,
          background: D.surface,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
          boxShadow: '0 -10px 30px rgba(0,0,0,0.5)',
          maxHeight: '85dvh',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            width: 36,
            height: 4,
            background: D.hair3,
            borderRadius: 2,
            margin: '8px auto 4px',
          }}
        />
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: '10px 18px 12px' }}>
      <div
        style={{
          color: D.ink,
          fontSize: 17,
          fontWeight: 600,
          letterSpacing: -0.2,
          textAlign: 'center',
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            color: D.mute,
            fontSize: 13,
            marginTop: 6,
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

export function ActionRow({
  label,
  icon,
  onClick,
  danger,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        background: 'transparent',
        border: 'none',
        borderTop: `0.5px solid ${D.hair}`,
        color: danger ? D.danger : D.ink,
        padding: '14px 18px',
        fontSize: 16,
        fontWeight: 500,
        letterSpacing: -0.1,
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        fontFamily: MOBILE_FONT_STACK,
      }}
    >
      {icon && <span style={{ flexShrink: 0, color: danger ? D.danger : D.ink2 }}>{icon}</span>}
      {label}
    </button>
  );
}

export function Divider() {
  return <div style={{ height: 8, background: D.bg }} />;
}

export function CancelRow({ onClick, label = 'Cancel' }: { onClick: () => void; label?: string }) {
  return (
    <div style={{ background: D.bg, padding: '8px 12px 4px' }}>
      <button
        onClick={onClick}
        style={{
          width: '100%',
          background: D.surface,
          border: 'none',
          borderRadius: 12,
          padding: '14px 0',
          fontSize: 16,
          fontWeight: 600,
          color: D.ink,
          cursor: 'pointer',
          fontFamily: MOBILE_FONT_STACK,
        }}
      >
        {label}
      </button>
    </div>
  );
}

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void | Promise<void> }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        background: D.sky,
        color: '#0A0A0A',
        border: 'none',
        borderRadius: 10,
        padding: '12px 0',
        fontSize: 15,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: MOBILE_FONT_STACK,
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
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
      {children}
    </button>
  );
}

function ColorSwatch({
  color,
  active,
  onClick,
}: {
  color: string | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={color ?? 'No color'}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        border: 'none',
        padding: 0,
        background: color ?? 'transparent',
        boxShadow: active
          ? `inset 0 0 0 2px ${D.bg}, 0 0 0 2px ${D.ink}`
          : color
            ? 'none'
            : `inset 0 0 0 1px ${D.hair3}`,
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      {!color && (
        <svg
          width="36"
          height="36"
          viewBox="0 0 36 36"
          fill="none"
          style={{ position: 'absolute', inset: 0 }}
        >
          <line
            x1="8"
            y1="28"
            x2="28"
            y2="8"
            stroke={D.mute}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
