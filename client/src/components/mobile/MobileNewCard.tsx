// Full-screen "new card" sheet (design 04). Title is focused on mount, with
// optional description, label, and member selection before tapping Add.

import { useEffect, useRef, useState } from 'react';
import { useBoardStore } from '../../stores/boardStore.js';
import { api } from '../../api/client.js';
import { uploadAttachment } from '../../api/attachments.js';
import LabelBadge from '../board/LabelBadge.js';
import { D, MOBILE_FONT_STACK } from './mobileTheme.js';

interface MobileNewCardProps {
  listId: string;
  listName: string;
  onClose: () => void;
}

export default function MobileNewCard({ listId, listName, onClose }: MobileNewCardProps) {
  const labels = useBoardStore((s) => s.labels);
  const members = useBoardStore((s) => s.members);
  const addCard = useBoardStore((s) => s.addCard);
  const lists = useBoardStore((s) => s.lists);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [activeListId, setActiveListId] = useState(listId);
  const [section, setSection] = useState<'main' | 'labels' | 'members' | 'list'>('main');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const activeListName = lists.find((l) => l.id === activeListId)?.name ?? listName;

  async function handleCreate() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      // Create with title; labels/members/description are applied via follow-up
      // requests because the create endpoint only accepts name+position. addCard
      // now returns the created card, so we never have to guess from name.
      const newCard = await addCard(activeListId, title.trim());
      const apiPromises: Promise<unknown>[] = [];
      if (description.trim()) {
        apiPromises.push(
          useBoardStore.getState().updateCard(newCard.id, { description: description.trim() }),
        );
      }
      for (const id of labelIds) {
        apiPromises.push(
          api.post(`/cards/${newCard.id}/labels/${id}`).then(() => {
            useBoardStore.getState().toggleCardLabel(newCard.id, id, true);
          }),
        );
      }
      for (const id of memberIds) {
        apiPromises.push(
          api.post(`/cards/${newCard.id}/members/${id}`).then(() => {
            useBoardStore.getState().toggleCardMember(newCard.id, id, true);
          }),
        );
      }
      await Promise.all(apiPromises);

      // Attachments use multipart uploads scoped to the now-created card. Settle
      // each independently so one failure doesn't drop the others, then bump the
      // board badge by however many landed.
      if (files.length > 0) {
        const results = await Promise.allSettled(
          files.map((file) => uploadAttachment(newCard.id, file)),
        );
        const uploaded = results.filter((r) => r.status === 'fulfilled').length;
        useBoardStore.getState().incrementCardAttachmentCount(newCard.id, uploaded);

        const failed = results.length - uploaded;
        if (failed > 0) {
          // The card exists; keep the sheet open so the user knows some files
          // didn't upload (re-tapping Add would create a different card).
          setFiles([]);
          setError(
            `Card created, but ${failed} attachment${failed > 1 ? 's' : ''} failed to upload. ` +
              `Open the card to add ${failed > 1 ? 'them' : 'it'} again.`,
          );
          return;
        }
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add card');
    } finally {
      setSaving(false);
    }
  }

  function addFiles(selected: FileList | null) {
    if (selected && selected.length > 0) {
      setFiles((prev) => [...prev, ...Array.from(selected)]);
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  const canSave = title.trim().length > 0 && !saving;

  return (
    <div
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
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 6,
          paddingBottom: 10,
          paddingLeft: 16,
          paddingRight: 16,
          borderBottom: `0.5px solid ${D.hair}`,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: D.mute,
            padding: 4,
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <div style={{ fontSize: 16, fontWeight: 600 }}>New card</div>
        <button
          disabled={!canSave}
          onClick={handleCreate}
          style={{
            background: 'transparent',
            border: 'none',
            color: canSave ? D.sky : D.mute2,
            padding: 4,
            fontSize: 15,
            fontWeight: 600,
            cursor: canSave ? 'pointer' : 'default',
          }}
        >
          {saving ? 'Adding…' : 'Add'}
        </button>
      </header>

      {section === 'main' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* List selector */}
          <button
            onClick={() => setSection('list')}
            style={{
              background: D.surface,
              border: `0.5px solid ${D.hair2}`,
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: D.ink,
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: MOBILE_FONT_STACK,
            }}
          >
            <span style={{ color: D.mute, fontWeight: 500 }}>List</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {activeListName}
              <Chevron />
            </span>
          </button>

          {/* Title */}
          <div
            style={{
              background: D.surface,
              border: `0.5px solid ${D.hair2}`,
              borderRadius: 12,
              padding: '14px 14px',
            }}
          >
            <textarea
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Card title"
              rows={2}
              style={{
                width: '100%',
                background: 'transparent',
                color: D.ink,
                border: 'none',
                outline: 'none',
                resize: 'none',
                fontSize: 18,
                fontWeight: 500,
                letterSpacing: -0.2,
                lineHeight: 1.3,
                fontFamily: MOBILE_FONT_STACK,
              }}
            />
          </div>

          {/* Description */}
          <div
            style={{
              background: D.surface,
              border: `0.5px solid ${D.hair2}`,
              borderRadius: 12,
              padding: 14,
            }}
          >
            <div style={{ fontSize: 12, color: D.mute, fontWeight: 500, marginBottom: 6, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              Description
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description…"
              rows={3}
              style={{
                width: '100%',
                background: 'transparent',
                color: D.ink,
                border: 'none',
                outline: 'none',
                resize: 'vertical',
                fontSize: 15,
                lineHeight: 1.4,
                fontFamily: MOBILE_FONT_STACK,
              }}
            />
          </div>

          {/* Labels */}
          <button
            onClick={() => setSection('labels')}
            style={{
              background: D.surface,
              border: `0.5px solid ${D.hair2}`,
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: D.ink,
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: MOBILE_FONT_STACK,
            }}
          >
            <span style={{ color: D.mute, fontWeight: 500 }}>Labels</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {labelIds.length === 0 ? (
                <span style={{ color: D.mute2 }}>None</span>
              ) : (
                labels
                  .filter((l) => labelIds.includes(l.id))
                  .slice(0, 4)
                  .map((l) => (
                    <LabelBadge key={l.id} color={l.color} name={l.name} size="sm" />
                  ))
              )}
              <Chevron />
            </span>
          </button>

          {/* Members */}
          <button
            onClick={() => setSection('members')}
            style={{
              background: D.surface,
              border: `0.5px solid ${D.hair2}`,
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: D.ink,
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: MOBILE_FONT_STACK,
            }}
          >
            <span style={{ color: D.mute, fontWeight: 500 }}>Members</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {memberIds.length === 0 ? (
                <span style={{ color: D.mute2 }}>None</span>
              ) : (
                <span>{memberIds.length} assigned</span>
              )}
              <Chevron />
            </span>
          </button>

          {/* Attachments — tapping opens the native picker (camera / photos / files). */}
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: D.surface,
              border: `0.5px solid ${D.hair2}`,
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: D.ink,
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: MOBILE_FONT_STACK,
            }}
          >
            <span style={{ color: D.mute, fontWeight: 500 }}>Attachments</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {files.length > 0 && <span>{files.length} selected</span>}
              <span style={{ color: D.sky, fontWeight: 600 }}>+ Add</span>
            </span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              addFiles(e.target.files);
              // Reset so the same file can be picked again after removal.
              e.target.value = '';
            }}
          />

          {files.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {files.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: D.surface,
                    border: `0.5px solid ${D.hair2}`,
                    borderRadius: 10,
                    padding: '10px 12px',
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: 14,
                      color: D.ink,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {file.name}
                  </span>
                  <button
                    onClick={() => removeFile(i)}
                    aria-label={`Remove ${file.name}`}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: D.mute,
                      fontSize: 20,
                      lineHeight: 1,
                      padding: '0 4px',
                      cursor: 'pointer',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div
              style={{
                background: 'rgba(220,38,38,0.12)',
                border: '0.5px solid rgba(220,38,38,0.4)',
                color: '#f87171',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 13,
                lineHeight: 1.4,
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}

      {section === 'list' && (
        <SubSection title="Move to list" onBack={() => setSection('main')}>
          {lists.map((l) => (
            <SelectRow
              key={l.id}
              label={l.name}
              selected={l.id === activeListId}
              onClick={() => {
                setActiveListId(l.id);
                setSection('main');
              }}
              swatch={l.color ?? undefined}
            />
          ))}
        </SubSection>
      )}

      {section === 'labels' && (
        <SubSection title="Labels" onBack={() => setSection('main')}>
          {labels.length === 0 ? (
            <EmptySub message="No labels on this board yet." />
          ) : (
            labels.map((l) => (
              <SelectRow
                key={l.id}
                label={l.name ?? l.color}
                selected={labelIds.includes(l.id)}
                onClick={() =>
                  setLabelIds((prev) =>
                    prev.includes(l.id) ? prev.filter((x) => x !== l.id) : [...prev, l.id],
                  )
                }
                left={<LabelBadge color={l.color} name={l.name} size="md" />}
              />
            ))
          )}
        </SubSection>
      )}

      {section === 'members' && (
        <SubSection title="Members" onBack={() => setSection('main')}>
          {members.length === 0 ? (
            <EmptySub message="No members on this board yet." />
          ) : (
            members.map((m) => (
              <SelectRow
                key={m.id}
                label={m.displayName}
                selected={memberIds.includes(m.id)}
                onClick={() =>
                  setMemberIds((prev) =>
                    prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                  )
                }
                left={<Avatar member={m} />}
              />
            ))
          )}
        </SubSection>
      )}
    </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg width="11" height="14" viewBox="0 0 11 14" fill="none">
      <path
        d="M3 2l5 5-5 5"
        stroke={D.mute}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SubSection({
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
            <path
              d="M7 2L2 7l5 5"
              stroke={D.sky}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
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
          <path
            d="M2 7l5 5L16 2"
            stroke={D.sky}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

function Avatar({
  member,
}: {
  member: { displayName: string; avatarUrl: string | null };
}) {
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

function EmptySub({ message }: { message: string }) {
  return (
    <div style={{ padding: '40px 24px', color: D.mute, textAlign: 'center', fontSize: 14 }}>
      {message}
    </div>
  );
}
