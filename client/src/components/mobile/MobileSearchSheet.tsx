// Full-screen search overlay shared across mobile screens. Debounces input then
// hits the same /search endpoint as desktop, but renders iOS-style result rows.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearchStore } from '../../stores/searchStore.js';
import { MOBILE_BOTTOM_BAR_HEIGHT } from './MobileBottomBar.js';
import { D, MOBILE_FONT_STACK } from './mobileTheme.js';

interface MobileSearchSheetProps {
  onClose: () => void;
}

export default function MobileSearchSheet({ onClose }: MobileSearchSheetProps) {
  const navigate = useNavigate();
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const results = useSearchStore((s) => s.results);
  const loading = useSearchStore((s) => s.loading);
  const search = useSearchStore((s) => s.search);
  const clear = useSearchStore((s) => s.clear);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [local, setLocal] = useState(query);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(local);
      search(local);
    }, 200);
    return () => clearTimeout(id);
  }, [local, setQuery, search]);

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
          paddingTop: 'max(env(safe-area-inset-top), 10px)',
          paddingBottom: 10,
          paddingLeft: 12,
          paddingRight: 12,
          borderBottom: `0.5px solid ${D.hair}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: D.surface2,
            border: `0.5px solid ${D.hair2}`,
            borderRadius: 10,
            padding: '8px 12px',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="10.5" cy="10.5" r="6" stroke={D.mute} strokeWidth="1.5" />
            <path d="M15 15l5 5" stroke={D.mute} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            placeholder="Search cards, lists, comments…"
            style={{
              flex: 1,
              background: 'transparent',
              color: D.ink,
              border: 'none',
              outline: 'none',
              fontSize: 16,
              fontFamily: MOBILE_FONT_STACK,
            }}
          />
          {local && (
            <button
              onClick={() => {
                setLocal('');
                clear();
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              style={{
                background: 'transparent',
                border: 'none',
                padding: 2,
                color: D.mute,
                display: 'inline-flex',
                alignItems: 'center',
                cursor: 'pointer',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" fill={D.mute2} />
                <path d="M5 5l6 6M11 5l-6 6" stroke={D.bg} strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: D.mute, fontSize: 14 }}>
            Searching…
          </div>
        )}
        {!loading && local.trim() && results.length === 0 && (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: D.mute, fontSize: 14 }}>
            No matches for "{local}".
          </div>
        )}
        {results.map((r) => (
          <button
            key={`${r.cardId}-${r.matchSource}`}
            onClick={() => {
              navigate(`/b/${r.boardId}?card=${r.cardId}`);
              onClose();
            }}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              borderBottom: `0.5px solid ${D.hair}`,
              color: D.ink,
              padding: '14px 18px',
              textAlign: 'left',
              cursor: 'pointer',
              fontFamily: MOBILE_FONT_STACK,
            }}
          >
            <div style={{ fontSize: 12, color: D.mute, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 2 }}>
              {r.boardName} · {r.listName}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>{r.cardName}</div>
            {r.snippet && (
              <div
                style={{
                  marginTop: 4,
                  color: D.mute,
                  fontSize: 13,
                  lineHeight: 1.35,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
                dangerouslySetInnerHTML={{ __html: r.snippet }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
