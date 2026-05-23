// Full-screen iOS-style card detail sheet (design 03). Edits title and
// description in place, with section rows for labels, members, list, and
// destructive actions exposed via a three-dot menu.

import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { useBoardStore } from '../../stores/boardStore.js';
import LabelBadge from '../board/LabelBadge.js';
import MarkdownRenderer from '../card/MarkdownRenderer.js';
import { D, MOBILE_FONT_STACK } from './mobileTheme.js';
import { Sheet, SheetHeader, ActionRow, CancelRow, Divider } from './MobileListMenu.js';

interface CardAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes?: number;
}

interface CardDetailData {
  id: string;
  listId: string;
  boardId: string;
  name: string;
  description: string | null;
  position: number;
  labels: { id: string; name: string | null; color: string }[];
  members: { id: string; displayName: string; username: string; avatarUrl: string | null }[];
  checklists: {
    id: string;
    name: string;
    position: number;
    items: { id: string; name: string; checked: boolean; position: number }[];
  }[];
  attachments: CardAttachment[];
  commentCount: number;
  isTemplate: boolean;
  coverAttachmentId: string | null;
}

interface MobileCardSheetProps {
  cardId: string;
  onClose: () => void;
}

export default function MobileCardSheet({ cardId, onClose }: MobileCardSheetProps) {
  const [card, setCard] = useState<CardDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState('');

  const [section, setSection] = useState<'main' | 'labels' | 'members' | 'list' | 'menu'>('main');

  const [uploading, setUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const lists = useBoardStore((s) => s.lists);
  const labels = useBoardStore((s) => s.labels);
  const members = useBoardStore((s) => s.members);
  const updateCardStore = useBoardStore((s) => s.updateCard);
  const deleteCardStore = useBoardStore((s) => s.deleteCard);
  const toggleCardLabel = useBoardStore((s) => s.toggleCardLabel);
  const toggleCardMember = useBoardStore((s) => s.toggleCardMember);

  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const descRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ card: CardDetailData }>(`/cards/${cardId}`)
      .then((data) => {
        if (cancelled) return;
        setCard(data.card);
        setTitleValue(data.card.name);
        setDescValue(data.card.description ?? '');
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load card');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  async function refreshAttachments() {
    try {
      const data = await api.get<{ card: CardDetailData }>(`/cards/${cardId}`);
      setCard((prev) =>
        prev
          ? {
              ...prev,
              attachments: data.card.attachments,
              coverAttachmentId: data.card.coverAttachmentId,
            }
          : data.card,
      );
    } catch {
      // surfaced through attachmentError on the action that triggered it
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setAttachmentError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/v1/cards/${cardId}/attachments`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(data.error?.message || 'Upload failed');
      }
      await refreshAttachments();
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function deleteAttachment(attachmentId: string) {
    setAttachmentError(null);
    try {
      const res = await fetch(`/api/v1/attachments/${attachmentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 204) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(data.error?.message || 'Delete failed');
      }
      await refreshAttachments();
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  useEffect(() => {
    if (editingTitle) titleRef.current?.focus();
  }, [editingTitle]);

  useEffect(() => {
    if (editingDesc) descRef.current?.focus();
  }, [editingDesc]);

  const list = card ? lists.find((l) => l.id === card.listId) : undefined;

  async function saveTitle() {
    if (!card) return;
    const v = titleValue.trim();
    if (!v || v === card.name) {
      setTitleValue(card.name);
      setEditingTitle(false);
      return;
    }
    await updateCardStore(cardId, { name: v });
    setCard((prev) => (prev ? { ...prev, name: v } : prev));
    setEditingTitle(false);
  }

  async function saveDesc() {
    if (!card) return;
    const v = descValue.trim() || null;
    if (v === (card.description ?? null)) {
      setEditingDesc(false);
      return;
    }
    await updateCardStore(cardId, { description: v });
    setCard((prev) => (prev ? { ...prev, description: v } : prev));
    setEditingDesc(false);
  }

  async function moveToList(targetListId: string) {
    if (!card || targetListId === card.listId) {
      setSection('main');
      return;
    }
    await api.post(`/cards/${card.id}/move`, { listId: targetListId, position: 65536 });
    useBoardStore.getState().moveCardLocally(card.id, card.listId, targetListId, 0);
    setCard((prev) => (prev ? { ...prev, listId: targetListId } : prev));
    setSection('main');
  }

  async function toggleLabel(labelId: string, currentlyOn: boolean) {
    if (!card) return;
    if (currentlyOn) {
      await api.delete(`/cards/${card.id}/labels/${labelId}`);
      toggleCardLabel(card.id, labelId, false);
      setCard((prev) =>
        prev ? { ...prev, labels: prev.labels.filter((l) => l.id !== labelId) } : prev,
      );
    } else {
      await api.post(`/cards/${card.id}/labels/${labelId}`);
      toggleCardLabel(card.id, labelId, true);
      const label = labels.find((l) => l.id === labelId);
      if (label) {
        setCard((prev) =>
          prev
            ? {
                ...prev,
                labels: [...prev.labels, { id: label.id, name: label.name, color: label.color }],
              }
            : prev,
        );
      }
    }
  }

  async function toggleMember(memberId: string, currentlyOn: boolean) {
    if (!card) return;
    if (currentlyOn) {
      await api.delete(`/cards/${card.id}/members/${memberId}`);
      toggleCardMember(card.id, memberId, false);
      setCard((prev) =>
        prev ? { ...prev, members: prev.members.filter((m) => m.id !== memberId) } : prev,
      );
    } else {
      await api.post(`/cards/${card.id}/members/${memberId}`);
      toggleCardMember(card.id, memberId, true);
      const m = members.find((x) => x.id === memberId);
      if (m) {
        setCard((prev) =>
          prev
            ? {
                ...prev,
                members: [...prev.members, { id: m.id, username: m.username, displayName: m.displayName, avatarUrl: m.avatarUrl }],
              }
            : prev,
        );
      }
    }
  }

  async function handleDelete() {
    if (!card) return;
    await deleteCardStore(card.id);
    onClose();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(0,0,0,0.5)',
        fontFamily: MOBILE_FONT_STACK,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: '100%',
        maxWidth: 540,
        height: '92dvh',
        background: D.bg,
        color: D.ink,
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        boxShadow: '0 -10px 30px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: MOBILE_FONT_STACK,
      }}
    >
      <div
        style={{
          width: 36,
          height: 4,
          background: D.hair3,
          borderRadius: 2,
          margin: '8px auto 4px',
          flexShrink: 0,
        }}
      />
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 6,
          paddingBottom: 10,
          paddingLeft: 12,
          paddingRight: 12,
          borderBottom: `0.5px solid ${D.hair}`,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: D.sky,
            padding: 8,
            fontSize: 15,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <svg width="9" height="14" viewBox="0 0 9 14" fill="none">
            <path d="M7 2L2 7l5 5" stroke={D.sky} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <div style={{ fontSize: 14, color: D.mute, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {list?.name ?? ''}
        </div>
        <button
          onClick={() => setSection('menu')}
          aria-label="Card actions"
          style={{
            background: 'transparent',
            border: 'none',
            color: D.ink2,
            padding: 8,
            cursor: 'pointer',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="6" cy="12" r="1.6" fill={D.ink2} />
            <circle cx="12" cy="12" r="1.6" fill={D.ink2} />
            <circle cx="18" cy="12" r="1.6" fill={D.ink2} />
          </svg>
        </button>
      </header>

      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.mute }}>
          Loading…
        </div>
      )}

      {error && !loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.danger }}>
          {error}
        </div>
      )}

      {!loading && !error && card && section === 'main' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {card.coverAttachmentId && (
            <div
              style={{
                height: 180,
                backgroundImage: `url(/api/v1/attachments/${card.coverAttachmentId}/download)`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
          )}

          {/* Title */}
          <div style={{ padding: '16px 18px 6px' }}>
            {editingTitle ? (
              <textarea
                ref={titleRef}
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={saveTitle}
                rows={2}
                style={{
                  width: '100%',
                  background: 'transparent',
                  color: D.ink,
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: -0.3,
                  lineHeight: 1.25,
                  fontFamily: MOBILE_FONT_STACK,
                }}
              />
            ) : (
              <h1
                onClick={() => setEditingTitle(true)}
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: -0.3,
                  lineHeight: 1.25,
                  margin: 0,
                  cursor: 'text',
                }}
              >
                {card.name}
              </h1>
            )}
          </div>

          {/* Labels strip */}
          {card.labels.length > 0 && (
            <div style={{ padding: '4px 18px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {card.labels.map((l) => (
                <LabelBadge key={l.id} color={l.color} name={l.name} size="md" />
              ))}
            </div>
          )}

          {/* Section rows */}
          <SectionRow
            label="List"
            value={list?.name ?? '—'}
            valueColor={list?.color ?? undefined}
            onClick={() => setSection('list')}
          />
          <SectionRow
            label="Labels"
            value={card.labels.length === 0 ? 'None' : `${card.labels.length} selected`}
            onClick={() => setSection('labels')}
          />
          <SectionRow
            label="Members"
            value={
              card.members.length === 0
                ? 'None'
                : card.members.map((m) => m.displayName).join(', ')
            }
            onClick={() => setSection('members')}
          />

          {/* Description */}
          <div style={{ padding: '20px 18px 12px' }}>
            <div
              style={{
                fontSize: 12,
                color: D.mute,
                fontWeight: 500,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Description</span>
              {!editingDesc && (
                <button
                  onClick={() => {
                    setDescValue(card.description ?? '');
                    setEditingDesc(true);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: D.sky,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Edit
                </button>
              )}
            </div>
            {editingDesc ? (
              <div>
                <textarea
                  ref={descRef}
                  value={descValue}
                  onChange={(e) => setDescValue(e.target.value)}
                  rows={6}
                  style={{
                    width: '100%',
                    background: D.surface,
                    color: D.ink,
                    border: `0.5px solid ${D.hair2}`,
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 15,
                    lineHeight: 1.4,
                    fontFamily: MOBILE_FONT_STACK,
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    onClick={saveDesc}
                    style={{
                      flex: 1,
                      background: D.sky,
                      color: '#0A0A0A',
                      border: 'none',
                      borderRadius: 10,
                      padding: '10px 0',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: MOBILE_FONT_STACK,
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setDescValue(card.description ?? '');
                      setEditingDesc(false);
                    }}
                    style={{
                      flex: 1,
                      background: D.surface2,
                      color: D.ink,
                      border: `0.5px solid ${D.hair2}`,
                      borderRadius: 10,
                      padding: '10px 0',
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: MOBILE_FONT_STACK,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : card.description ? (
              <div
                onClick={() => {
                  setDescValue(card.description ?? '');
                  setEditingDesc(true);
                }}
                style={{
                  background: D.surface,
                  borderRadius: 10,
                  border: `0.5px solid ${D.hair2}`,
                  padding: 14,
                  fontSize: 15,
                  lineHeight: 1.4,
                  cursor: 'text',
                  color: D.ink,
                }}
              >
                <MarkdownRenderer content={card.description} />
              </div>
            ) : (
              <div
                onClick={() => {
                  setDescValue('');
                  setEditingDesc(true);
                }}
                style={{
                  background: D.surface,
                  border: `0.5px dashed ${D.hair3}`,
                  borderRadius: 10,
                  padding: 14,
                  color: D.mute,
                  fontSize: 14,
                  cursor: 'text',
                }}
              >
                Add a description…
              </div>
            )}
          </div>

          {/* Checklists summary */}
          {card.checklists.length > 0 && (
            <div style={{ padding: '12px 18px 8px' }}>
              <div
                style={{
                  fontSize: 12,
                  color: D.mute,
                  fontWeight: 500,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Checklists
              </div>
              {card.checklists.map((cl) => {
                const total = cl.items.length;
                const checked = cl.items.filter((i) => i.checked).length;
                return (
                  <div
                    key={cl.id}
                    style={{
                      background: D.surface,
                      border: `0.5px solid ${D.hair2}`,
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 14 }}>
                      <span>{cl.name}</span>
                      <span style={{ color: D.mute }}>
                        {checked}/{total}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Attachments */}
          <div style={{ padding: '12px 18px 8px' }}>
            <div
              style={{
                fontSize: 12,
                color: D.mute,
                fontWeight: 500,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Attachments</span>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: uploading ? D.mute : D.sky,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: uploading ? 'default' : 'pointer',
                  fontFamily: MOBILE_FONT_STACK,
                }}
              >
                {uploading ? 'Uploading…' : '+ Add'}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadFile(f);
                e.target.value = '';
              }}
            />
            {attachmentError && (
              <div
                style={{
                  background: 'rgba(255,91,91,0.1)',
                  border: `0.5px solid ${D.danger}`,
                  color: D.danger,
                  borderRadius: 10,
                  padding: '8px 12px',
                  marginBottom: 8,
                  fontSize: 13,
                }}
              >
                {attachmentError}
              </div>
            )}
            {card.attachments.length === 0 && !uploading ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100%',
                  background: D.surface,
                  border: `0.5px dashed ${D.hair3}`,
                  borderRadius: 10,
                  padding: 14,
                  color: D.mute,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: MOBILE_FONT_STACK,
                  textAlign: 'center',
                }}
              >
                Tap to add an attachment
              </button>
            ) : (
              card.attachments.map((a) => {
                const isImage = a.mimeType.startsWith('image/');
                return (
                  <div
                    key={a.id}
                    style={{
                      background: D.surface,
                      border: `0.5px solid ${D.hair2}`,
                      borderRadius: 10,
                      padding: '10px 12px',
                      marginBottom: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: D.surface2,
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: D.mute,
                      }}
                    >
                      {isImage ? (
                        <img
                          src={`/api/v1/attachments/${a.id}/download`}
                          alt={a.filename}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M7 21h10a2 2 0 002-2V9.4a1 1 0 00-.3-.7l-5.4-5.4a1 1 0 00-.7-.3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <a
                      href={`/api/v1/attachments/${a.id}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 14,
                        color: D.ink2,
                        textDecoration: 'none',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {a.filename}
                    </a>
                    <button
                      onClick={() => deleteAttachment(a.id)}
                      aria-label={`Delete ${a.filename}`}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: D.mute,
                        padding: 6,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M7 7l1 12a2 2 0 002 2h4a2 2 0 002-2l1-12"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Comment count footer */}
          <div style={{ padding: '14px 18px 32px', color: D.mute, fontSize: 13 }}>
            {card.commentCount} comment{card.commentCount === 1 ? '' : 's'}
          </div>
        </div>
      )}

      {!loading && !error && card && section === 'list' && (
        <SubScreen title="Move to list" onBack={() => setSection('main')}>
          {lists.map((l) => (
            <SelectRow
              key={l.id}
              label={l.name}
              selected={l.id === card.listId}
              onClick={() => moveToList(l.id)}
              swatch={l.color ?? undefined}
            />
          ))}
        </SubScreen>
      )}

      {!loading && !error && card && section === 'labels' && (
        <SubScreen title="Labels" onBack={() => setSection('main')}>
          {labels.length === 0 ? (
            <Empty message="No labels on this board yet." />
          ) : (
            labels.map((l) => {
              const on = card.labels.some((x) => x.id === l.id);
              return (
                <SelectRow
                  key={l.id}
                  label={l.name ?? l.color}
                  selected={on}
                  onClick={() => toggleLabel(l.id, on)}
                  left={<LabelBadge color={l.color} name={l.name} size="md" />}
                />
              );
            })
          )}
        </SubScreen>
      )}

      {!loading && !error && card && section === 'members' && (
        <SubScreen title="Members" onBack={() => setSection('main')}>
          {members.length === 0 ? (
            <Empty message="No members on this board yet." />
          ) : (
            members.map((m) => {
              const on = card.members.some((x) => x.id === m.id);
              return (
                <SelectRow
                  key={m.id}
                  label={m.displayName}
                  selected={on}
                  onClick={() => toggleMember(m.id, on)}
                  left={<Avatar member={m} />}
                />
              );
            })
          )}
        </SubScreen>
      )}

      {section === 'menu' && (
        <Sheet onClose={() => setSection('main')}>
          <SheetHeader title="Card actions" />
          <ActionRow
            label={card?.isTemplate ? 'Remove template' : 'Make template'}
            onClick={async () => {
              if (!card) return;
              const next = !card.isTemplate;
              await api.patch(`/cards/${card.id}`, { isTemplate: next });
              setCard((prev) => (prev ? { ...prev, isTemplate: next } : prev));
              setSection('main');
            }}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M8 4h8l4 4v12a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />
          <Divider />
          <ActionRow
            label="Delete card"
            danger
            onClick={handleDelete}
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
          <CancelRow onClick={() => setSection('main')} />
        </Sheet>
      )}
    </div>
    </div>
  );
}

function SectionRow({
  label,
  value,
  valueColor,
  onClick,
}: {
  label: string;
  value: string;
  valueColor?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        background: 'transparent',
        border: 'none',
        borderTop: `0.5px solid ${D.hair}`,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        cursor: 'pointer',
        fontFamily: MOBILE_FONT_STACK,
      }}
    >
      <span style={{ color: D.mute, fontSize: 14, fontWeight: 500 }}>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: D.ink, fontSize: 15, maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {valueColor && (
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              background: valueColor,
              flexShrink: 0,
            }}
          />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
        <svg width="9" height="14" viewBox="0 0 9 14" fill="none">
          <path d="M2 2l5 5-5 5" stroke={D.mute} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}

function SubScreen({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div
        style={{
          padding: '10px 12px',
          borderBottom: `0.5px solid ${D.hair}`,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            border: 'none',
            color: D.sky,
            padding: 6,
            fontSize: 15,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <svg width="9" height="14" viewBox="0 0 9 14" fill="none">
            <path d="M7 2L2 7l5 5" stroke={D.sky} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <div style={{ marginLeft: 8, fontSize: 15, fontWeight: 600 }}>{title}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function SelectRow({
  label,
  selected,
  onClick,
  left,
  swatch,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  left?: React.ReactNode;
  swatch?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        background: 'transparent',
        border: 'none',
        borderBottom: `0.5px solid ${D.hair}`,
        color: D.ink,
        padding: '13px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 15,
        cursor: 'pointer',
        fontFamily: MOBILE_FONT_STACK,
        textAlign: 'left',
      }}
    >
      {left}
      {swatch && (
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            background: swatch,
            flexShrink: 0,
          }}
        />
      )}
      <span style={{ flex: 1 }}>{label}</span>
      {selected && (
        <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
          <path d="M2 7l5 5L16 2" stroke={D.sky} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function Avatar({ member }: { member: { displayName: string; avatarUrl: string | null } }) {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        background: '#3A3A3A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 600,
        color: D.ink,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {member.avatarUrl ? (
        <img
          src={member.avatarUrl}
          alt={member.displayName}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        member.displayName.charAt(0).toUpperCase()
      )}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div style={{ padding: '40px 24px', color: D.mute, textAlign: 'center', fontSize: 14 }}>
      {message}
    </div>
  );
}
