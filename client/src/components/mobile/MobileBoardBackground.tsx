// Bottom sheet for choosing the current user's personal board background:
// a solid color (preset or custom) or an uploaded image. All choices are
// per-user — they don't change what other board members see.

import { useRef, useState } from 'react';
import { useBoardStore } from '../../stores/boardStore.js';
import { D, MOBILE_FONT_STACK, LIST_COLOR_PRESETS } from './mobileTheme.js';
import {
  Sheet,
  SheetHeader,
  CancelRow,
  PrimaryButton,
  SecondaryButton,
  ColorSwatch,
  CustomColorSwatch,
} from './MobileListMenu.js';

interface Props {
  board: { id: string; backgroundType: 'color' | 'image'; backgroundValue: string };
  onClose: () => void;
}

export default function MobileBoardBackground({ board, onClose }: Props) {
  const updateBoard = useBoardStore((s) => s.updateBoard);
  const setBoardBackgroundImage = useBoardStore((s) => s.setBoardBackgroundImage);
  const resetBoardBackground = useBoardStore((s) => s.resetBoardBackground);

  const [colorDraft, setColorDraft] = useState<string>(
    board.backgroundType === 'color' ? board.backgroundValue : '#0079bf',
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await setBoardBackgroundImage(board.id, file);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const isCustom = !LIST_COLOR_PRESETS.some((c) => c.toLowerCase() === colorDraft.toLowerCase());

  return (
    <Sheet onClose={onClose}>
      <SheetHeader title="Board background" subtitle="Only you see this color or image." />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 10,
          padding: '8px 18px 14px',
        }}
      >
        {LIST_COLOR_PRESETS.map((c) => (
          <ColorSwatch
            key={c}
            color={c}
            active={board.backgroundType === 'color' && colorDraft.toLowerCase() === c.toLowerCase()}
            onClick={() => setColorDraft(c)}
          />
        ))}
        <CustomColorSwatch
          active={board.backgroundType === 'color' && isCustom}
          current={colorDraft}
          onPick={(hex) => setColorDraft(hex)}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '0 18px 14px' }}>
        <PrimaryButton
          onClick={async () => {
            await updateBoard(board.id, { backgroundType: 'color', backgroundValue: colorDraft });
            onClose();
          }}
        >
          Use color
        </PrimaryButton>
        <SecondaryButton onClick={() => fileInputRef.current?.click()}>
          {uploading ? 'Uploading…' : board.backgroundType === 'image' ? 'Replace image' : 'Upload image'}
        </SecondaryButton>
      </div>

      {error && (
        <div style={{ padding: '0 18px 12px', color: D.danger, fontSize: 13, fontFamily: MOBILE_FONT_STACK }}>
          {error}
        </div>
      )}

      {board.backgroundType === 'image' && (
        <div style={{ padding: '0 18px 8px' }}>
          <SecondaryButton
            onClick={async () => {
              await resetBoardBackground(board.id);
              onClose();
            }}
          >
            Reset to default
          </SecondaryButton>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={handleFile}
      />

      <CancelRow onClick={onClose} />
    </Sheet>
  );
}
